import { ACTION_RISK, HARD_FLOORS, RISK_STRICTNESS, ReviewerVerdict, type Ask, type ApprovalProvenance, type RiskClass } from '@atlas/schemas';
import { col, now, listDocs, audit as rawAudit } from './firestore';
import { runTask } from './runner';
import { sendText } from './whatsapp';
import type { UserContext } from './context';
import { sha256 } from './crypto';

export type Proposal = { id: string; action: keyof typeof ACTION_RISK | string; summary: string; features: Record<string, string>; confidence: number; reason: string; pending: { type: string; payload: Record<string, any> } };
export type Decision = { id: string; allow: boolean; approval: ApprovalProvenance; reason: string };

export const isFloor = (t: string) => (HARD_FLOORS as readonly string[]).includes(t);
export const riskOf = (action: string): RiskClass => ACTION_RISK[action] ?? 'external';

/** Audit with provenance — every governed decision goes through here. */
export const gaudit = (uid: string, e: { action: string; approval: ApprovalProvenance; riskClass?: RiskClass; reason?: string; target?: { collection: string; id: string }; model?: string }) =>
  rawAudit(uid, { actor: 'brain', ...e });

const ruleMatches = (rule: { action: string; match: Record<string, string> }, p: Proposal) =>
  rule.action === p.action && Object.entries(rule.match).every(([k, v]) => (p.features[k] ?? '').toLowerCase().endsWith(v.toLowerCase()));

/**
 * Decide which proposed unattended actions may run now. Mirrors OpenWorker's ladder:
 * floors → paused → mode → standing rules → threshold → reviewer → ask.
 */
export const decide = async (ctx: UserContext, proposals: Proposal[]): Promise<Decision[]> => {
  const g = ctx.profile.governance;
  const out: Decision[] = [];
  const forReviewer: Proposal[] = [];
  for (const p of proposals) {
    const risk = riskOf(p.action);
    if (isFloor(p.pending.type)) { out.push({ id: p.id, allow: false, approval: 'floor', reason: 'human-only action' }); continue; }
    if (RISK_STRICTNESS[risk] <= RISK_STRICTNESS.egress || risk === 'write_local') { out.push({ id: p.id, allow: true, approval: 'auto', reason: `${risk} is not gated` }); continue; }
    if (g.paused) { out.push({ id: p.id, allow: false, approval: 'paused', reason: g.pausedReason ?? 'autonomy paused by circuit breaker' }); continue; }
    const rule = g.allow.find((r) => ruleMatches(r, p));
    if (rule) { out.push({ id: p.id, allow: true, approval: 'rule', reason: rule.note || rule.id }); continue; }
    if (g.mode === 'ask') { out.push({ id: p.id, allow: false, approval: 'denied', reason: 'mode=ask' }); continue; }
    if (p.confidence >= g.reviewThreshold && g.mode === 'auto') { out.push({ id: p.id, allow: true, approval: 'auto', reason: `confidence ${p.confidence}` }); continue; }
    forReviewer.push(p);
  }
  if (forReviewer.length) {
    try {
      const r = await runTask({
        ctx, task: 'governance.review', schema: ReviewerVerdict, cacheTtl: 3600, refId: sha256(forReviewer.map((p) => p.id).join(',')),
        vars: {
          approvalGuidance: g.approvalGuidance || '(none given — be conservative)',
          rules: g.allow.map((r) => `- ${r.action} when ${JSON.stringify(r.match)} (${r.note})`).join('\n') || '(none)',
          noise: ctx.profile.noise,
          actions: forReviewer.map((p) => ({ id: p.id, action: p.action, summary: p.summary, from: p.features.fromEmail, confidence: p.confidence, proposerReason: p.reason })),
        },
      });
      const byId = new Map(r.output.verdicts.map((v) => [v.id, v]));
      for (const p of forReviewer) { const v = byId.get(p.id); out.push({ id: p.id, allow: v?.verdict === 'allow', approval: v?.verdict === 'allow' ? 'reviewer' : 'denied', reason: v ? `${v.verdict}: ${v.reason}` : 'reviewer gave no verdict' }); }
    } catch (e) {
      for (const p of forReviewer) out.push({ id: p.id, allow: false, approval: 'denied', reason: `reviewer unavailable: ${String(e).slice(0, 80)}` });
    }
  }
  return out;
};

/** Park a decision for the human. Returns the ask id. Also pings WhatsApp (egress to owner). */
export const park = async (ctx: UserContext, ask: Omit<Ask, 'id' | 'createdAt' | 'status'> & { dedupe?: string }) => {
  const id = ask.dedupe ? sha256(`${ctx.uid}|ask|${ask.dedupe}`) : col(ctx.uid, 'asks').doc().id;
  const ref = col(ctx.uid, 'asks').doc(id);
  if ((await ref.get()).exists) return id;
  const { dedupe, ...rest } = ask;
  await ref.set({ ...rest, status: 'pending', createdAt: now(), expiresAt: new Date(Date.now() + 7 * 86400e3).toISOString() });
  await gaudit(ctx.uid, { action: `parked ask: ${ask.question.slice(0, 80)}`, approval: 'denied', riskClass: ask.riskClass, target: { collection: 'asks', id } });
  if (ctx.profile.whatsapp.number && ctx.profile.okr.channel === 'whatsapp') {
    await sendText(ctx.profile.whatsapp.number, `❓ ${ask.question}\n${ask.options.map((o) => `${o.key}. ${o.label}`).join('\n')}\nReply with the number.`, { quiet: ctx.profile.whatsapp.quietHours, tz: ctx.timezone }).catch(() => {});
  }
  return id;
};

/** Earned autonomy: after 3 consistent user approvals of the same action+domain, propose a standing rule. */
export const maybePromote = async (ctx: UserContext, action: string, features: Record<string, string>) => {
  const key = features.fromDomain; if (!key) return;
  const approvals = await listDocs(ctx.uid, 'approvals', (q) => q.where('action', '==', action).where('fromDomain', '==', key));
  if (approvals.length < 3 || ctx.profile.governance.allow.some((r) => r.action === action && r.match.fromDomain === key)) return;
  await park(ctx, { kind: 'promoteRule', question: `You've approved "${action}" for ${key} ${approvals.length} times. Make it a standing rule?`, options: [{ key: '1', label: 'Yes, always' }, { key: '2', label: 'Keep asking' }], context: { action, match: { fromDomain: key } }, dedupe: `promote:${action}:${key}` });
};

/** Circuit breaker: count overrides of auto-actions in the window; pause if over the limit. */
export const checkBreaker = async (ctx: UserContext) => {
  const g = ctx.profile.governance;
  if (g.paused) return { paused: true };
  const since = new Date(Date.now() - g.breaker.windowDays * 86400e3).toISOString();
  const overrides = await listDocs(ctx.uid, 'feedback', (q) => q.where('overrodeAuto', '==', true).where('createdAt', '>=', since));
  if (overrides.length < g.breaker.overrides) return { paused: false, overrides: overrides.length };
  await col(ctx.uid, 'profile').doc('main').set({ governance: { paused: true, pausedReason: `${overrides.length} auto-actions overridden in ${g.breaker.windowDays} days`, pausedAt: now() } }, { merge: true });
  await gaudit(ctx.uid, { action: 'circuit breaker tripped — autonomy paused', approval: 'paused', reason: `${overrides.length} overrides` });
  await park(ctx, { kind: 'resumeAutonomy', question: `I paused auto-filing: you corrected ${overrides.length} of my unattended actions this week. Resume?`, options: [{ key: '1', label: 'Resume' }, { key: '2', label: 'Stay paused' }, { key: '3', label: 'Switch to ask mode' }], context: {}, dedupe: `breaker:${now().slice(0, 10)}` });
  return { paused: true, overrides: overrides.length };
};
