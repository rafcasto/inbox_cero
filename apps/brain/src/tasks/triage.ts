import { TriageBatchOutput, TriageInputItem, type Profile, type Triage } from '@atlas/schemas';
import { col, now, listDocs } from '../lib/firestore';
import { runTask } from '../lib/runner';
import { projectsLine, areasLine, timezone, type UserContext } from '../lib/context';
import { sha256 } from '../lib/crypto';
import { decide, park, gaudit, type Proposal } from '../lib/governance';

const domainOf = (from: string) => (from.match(/@([\w.-]+)/)?.[1] ?? '').toLowerCase();
const emailOf = (from: string) => (from.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? '').toLowerCase();

const NOISE_SUBJECT = /\b(unsubscribe|newsletter|% off|sale ends|limited time|last chance|black friday|deal of|your weekly digest|webinar|promo code|flash sale|special offer|don't miss)\b/i;
const RECEIPT_SUBJECT = /\b(receipt|invoice|tax invoice|payment (received|confirmation)|your order|order confirmation|statement is ready)\b/i;

type RuleResult = { ruleId: string; triage: Triage; summary: string } | null;

/** Zero-cost deterministic rules. Returns null when the brain must decide. */
export const applyRules = (profile: Profile, it: TriageInputItem): RuleResult => {
  const from = it.from.toLowerCase();
  const dom = domainOf(from);
  const em = emailOf(from);
  const base = (priority: Triage['priority'], action: Triage['action'], reasoning: string, extra: Partial<Triage> = {}): Triage => ({
    priority, action, suggestedProjectId: null, suggestedAreaId: null, dueAt: null, confidence: 0.95, reasoning, isReceipt: false, isContentSeed: false, ...extra,
  });

  for (const r of profile.priorityRules) {
    const m = r.match;
    const hit = (m.fromDomain && dom.endsWith(m.fromDomain.toLowerCase())) || (m.fromEmail && em === m.fromEmail.toLowerCase())
      || (m.subjectContains && it.subject.toLowerCase().includes(m.subjectContains.toLowerCase()))
      || (m.keyword && (it.subject + ' ' + it.snippet).toLowerCase().includes(m.keyword.toLowerCase()));
    if (!hit) continue;
    if (r.effect.action === 'ignore') return { ruleId: r.id, triage: base('P3', 'ignore', `rule: ${r.note || r.id}`), summary: it.subject || '(no subject)' };
    if (r.effect.action === 'file') return { ruleId: r.id, triage: base('P2', 'file', `rule: ${r.note || r.id}`), summary: it.subject || '(no subject)' };
    if (r.effect.action === 'surface' || r.effect.priority) return null; // let the brain decide, but never auto-ignore
  }
  for (const s of profile.noise.alwaysSurface) if (s && (from.includes(s.toLowerCase()) || it.subject.toLowerCase().includes(s.toLowerCase()))) return null;
  for (const s of profile.noise.neverSurface) if (s && (from.includes(s.toLowerCase()) || it.subject.toLowerCase().includes(s.toLowerCase()))) {
    return { ruleId: 'noise.neverSurface', triage: base('P3', 'ignore', `matches never-surface "${s}"`), summary: it.subject };
  }
  if (RECEIPT_SUBJECT.test(it.subject)) return { ruleId: 'receipt', triage: base('P2', 'file', 'receipt/invoice pattern', { isReceipt: true, confidence: 0.85 }), summary: it.subject };
  if (it.hasListUnsubscribe && NOISE_SUBJECT.test(it.subject)) return { ruleId: 'bulk-marketing', triage: base('P3', 'ignore', 'bulk mail with marketing subject'), summary: it.subject };
  if (it.hasListUnsubscribe && /no-?reply|newsletter|marketing|promo|notifications?@|noreply/.test(em)) return { ruleId: 'bulk-noreply', triage: base('P3', 'ignore', 'bulk mail from no-reply sender'), summary: it.subject };
  return null;
};

const feedbackLines = async (uid: string, items: TriageInputItem[]) => {
  const domains = new Set(items.map((i) => domainOf(i.from)).filter(Boolean));
  const fb = await listDocs(uid, 'feedback', (q) => q.orderBy('createdAt', 'desc').limit(60));
  const relevant = [...fb.filter((f) => domains.has(f.features?.fromDomain)), ...fb.filter((f) => !domains.has(f.features?.fromDomain))].slice(0, 30);
  return relevant.map((f) => `- from ${f.features?.fromEmail || f.features?.fromDomain}: you suggested ${f.suggested?.priority}/${f.suggested?.action}, they chose ${f.actual?.priority}/${f.actual?.action}${f.actual?.projectId ? ' → project ' + f.actual.projectId : ''}`).join('\n') || '(no corrections yet)';
};

/** Triage a batch: rules first, then Claude. Persists onto items/{id}. Returns per-item results incl. whether to auto-act in the mailbox. */
export const triageItems = async (ctx: UserContext, payload: { items: TriageInputItem[] }) => {
  const items = payload.items.map((i) => TriageInputItem.parse(i));
  const results: Array<{ id: string; action: Triage['action']; priority: Triage['priority']; autoAct: boolean; by: 'rule' | 'brain' | 'error' }> = [];
  const forBrain: TriageInputItem[] = [];
  const writes: Array<[string, Record<string, unknown>]> = [];

  for (const it of items) {
    const r = applyRules(ctx.profile, it);
    if (r) {
      const status = r.triage.action === 'ignore' ? 'ignored' : r.triage.action === 'file' ? 'filed' : 'triaged';
      writes.push([it.id, { triage: { ...r.triage, model: 'rules', promptVersion: 'rules-1' }, ruleHit: { ruleId: r.ruleId, effect: r.triage.action }, summary: r.summary.slice(0, 300), status, triagedAt: now() }]);
      results.push({ id: it.id, action: r.triage.action, priority: r.triage.priority, autoAct: status !== 'triaged', by: 'rule' });
    } else forBrain.push(it);
  }

  if (forBrain.length) {
    try {
      const res = await runTask({
        ctx, task: 'triage.items', schema: TriageBatchOutput, refId: sha256(forBrain.map((i) => i.id).join(',')),
        vars: { projects: projectsLine(ctx), areas: areasLine(ctx), feedback: await feedbackLines(ctx.uid, forBrain), timezone: timezone(ctx), items: forBrain.map(({ snippet, ...rest }) => ({ ...rest, snippet: snippet.slice(0, 1500) })) },
      });
      const byId = new Map(res.output.results.map((r) => [r.id, r]));
      for (const it of forBrain) {
        const t = byId.get(it.id);
        if (!t) { results.push({ id: it.id, action: 'do', priority: 'P2', autoAct: false, by: 'error' }); continue; }
        const { id, summary, ...triage } = t;
        const known = ctx.projects.some((p) => p.id === triage.suggestedProjectId);
        const autoFile = (triage.action === 'ignore' && triage.confidence >= 0.8) || (triage.action === 'file' && triage.isReceipt && triage.confidence >= 0.7);
        const status = autoFile ? (triage.action === 'ignore' ? 'ignored' : 'filed') : 'triaged';
        writes.push([it.id, { triage: { ...triage, suggestedProjectId: known ? triage.suggestedProjectId : null, model: res.model, promptVersion: res.promptVersion }, summary: summary.slice(0, 300), status, triagedAt: now(), tags: triage.isContentSeed ? ['content-seed'] : [] }]);
        results.push({ id: it.id, action: triage.action, priority: triage.priority, autoAct: autoFile, by: 'brain' });
      }
    } catch (e) {
      for (const it of forBrain) { writes.push([it.id, { status: 'new', triageError: String(e).slice(0, 300) }]); results.push({ id: it.id, action: 'do', priority: 'P2', autoAct: false, by: 'error' }); }
    }
  }

  // Governance gate for external auto-actions (moving mail). Rules are trusted; brain proposals are reviewed.
  const proposals: Proposal[] = [];
  const itemById = new Map(items.map((i) => [i.id, i]));
  for (const r of results) {
    if (!r.autoAct || r.by !== 'brain' || !ctx.profile.email.mirrorToMailbox) continue; // Atlas-only filing is reversible → not gated
    const it = itemById.get(r.id)!; const w = writes.find(([id]) => id === r.id)?.[1] as any;
    proposals.push({ id: r.id, action: r.action === 'ignore' ? 'mail.autoIgnore' : 'mail.autoFile', summary: `${r.action}: ${w?.summary ?? it.subject}`, features: { fromDomain: domainOf(it.from), fromEmail: emailOf(it.from) }, confidence: w?.triage?.confidence ?? 0, reason: w?.triage?.reasoning ?? '', pending: { type: 'email.act', payload: { itemId: r.id, action: r.action } } });
  }
  if (proposals.length) {
    const decisions = await decide(ctx, proposals);
    for (const d of decisions) {
      const r = results.find((x) => x.id === d.id)!; const w = writes.find(([id]) => id === d.id)![1] as any; const p = proposals.find((x) => x.id === d.id)!;
      w.governance = { approval: d.approval, reason: d.reason };
      if (!d.allow) {
        r.autoAct = false; w.status = 'triaged'; // stays visible in the Inbox
        if (d.approval !== 'floor' && d.approval !== 'paused' && ctx.profile.governance.mode !== 'ask') {
          await park(ctx, { kind: 'approveAction', question: `Auto-${r.action} "${p.summary.slice(0, 80)}" from ${p.features.fromEmail}?`, options: [{ key: '1', label: 'Yes' }, { key: '2', label: 'No, keep in inbox' }], context: { itemId: d.id, action: p.action, features: p.features, reviewer: d.reason }, pendingAction: { type: 'email.act', payload: { integrationId: itemById.get(d.id) ? (writes.find(([id]) => id === d.id)![1] as any).integrationId : undefined, actions: [{ itemId: d.id, action: r.action }] } }, riskClass: 'external', dedupe: `approve:${d.id}` });
        }
      }
      await gaudit(ctx.uid, { action: `${d.allow ? 'auto-' : 'withheld auto-'}${r.action}: ${p.summary.slice(0, 60)}`, approval: d.approval, riskClass: 'external', reason: d.reason, target: { collection: 'items', id: d.id } });
    }
  }
  const batch = col(ctx.uid, 'items').firestore.batch();
  for (const [id, data] of writes) batch.set(col(ctx.uid, 'items').doc(id), data, { merge: true });
  await batch.commit();
  // Receipts → Finance queue
  const receipts = writes.filter(([, d]) => (d.triage as Triage | undefined)?.isReceipt).map(([id]) => id);
  for (const id of receipts) await col(ctx.uid, 'financeQueue').doc(id).set({ itemId: id, createdAt: now(), status: 'pending' });
  return { results, rules: results.filter((r) => r.by === 'rule').length, brain: results.filter((r) => r.by === 'brain').length };
};

/** triage.sweep — re-triage anything still `new` (ingested but never triaged, e.g. a poll died mid-way). Batches of 25, oldest first. */
export const triageSweep = async (ctx: UserContext, payload: { limit?: number }) => {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const stuck = (await listDocs(ctx.uid, 'items', (q) => q.where('status', '==', 'new').limit(payload.limit ?? 100)))
    .filter((i: any) => i.source?.type === 'email' && (i.ingestedAt ?? '') < cutoff && !i.triageError)
    .sort((a: any, b: any) => (a.receivedAt ?? '').localeCompare(b.receivedAt ?? ''));
  let done = 0;
  for (let i = 0; i < stuck.length; i += 25) {
    const batch = stuck.slice(i, i + 25).map((it: any) => TriageInputItem.parse({ id: it.id, from: it.raw?.from ?? '', to: it.raw?.to ?? '', subject: it.raw?.subject ?? '', receivedAt: it.receivedAt, snippet: String(it.raw?.body ?? it.raw?.snippet ?? '').slice(0, 4000), hasListUnsubscribe: Boolean(it.raw?.hasListUnsubscribe), source: 'email' }));
    const r = await triageItems(ctx, { items: batch });
    done += r.results.length;
  }
  return { swept: done, remaining: Math.max(0, stuck.length - done) };
};
