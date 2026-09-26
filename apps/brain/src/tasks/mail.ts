import { MailAskOutput } from '@atlas/schemas';
import { col, now, listDocs, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';

const windowStart = (ctx: UserContext) => new Date(Date.now() - ctx.profile.email.lookbackHours * 3600e3).toISOString();

/** Answer a question over the last N hours of mail only — citations + suggested (never executed) actions. */
export const mailAsk = async (ctx: UserContext, payload: { question: string }) => {
  const q = String(payload.question ?? '').trim();
  if (!q) throw new Error('question required');
  const items = (await listDocs(ctx.uid, 'items', (x) => x.where('receivedAt', '>=', windowStart(ctx)).orderBy('receivedAt', 'desc').limit(150)))
    .filter((i: any) => i.source?.type === 'email');
  const res = await runTask({
    ctx, task: 'mail.ask', schema: MailAskOutput, cacheTtl: 300,
    vars: { window: ctx.profile.email.lookbackHours, count: items.length, question: q, items: items.map((i: any) => ({ id: i.id, from: i.raw?.from, subject: i.raw?.subject, receivedAt: i.receivedAt, status: i.status, priority: i.triage?.priority, summary: i.summary, snippet: (i.raw?.snippet ?? '').slice(0, 300) })) },
  });
  await audit(ctx.uid, { actor: 'brain', action: `answered mail question: ${q.slice(0, 60)}`, model: res.model, reason: `${items.length} messages in window` });
  await col(ctx.uid, 'mailQuestions').add({ question: q, answer: res.output.answer, citations: res.output.citations, suggestedActions: res.output.suggestedActions, at: now(), windowHours: ctx.profile.email.lookbackHours, model: res.model });
  return res.output;
};

/** Nightly: anything older than the window still in the Inbox is auto-filed (Atlas only), tagged `expired`. */
export const mailExpire = async (ctx: UserContext) => {
  if (!ctx.profile.email.autoExpire) return { skipped: 'autoExpire off' };
  const cutoff = windowStart(ctx);
  const stale = (await listDocs(ctx.uid, 'items', (x) => x.where('status', 'in', ['new', 'triaged', 'snoozed']).where('receivedAt', '<', cutoff).limit(400)))
    .filter((i: any) => i.source?.type === 'email' && !(i.snoozedUntil && i.snoozedUntil > now()) && i.triage?.priority !== 'P0');
  if (!stale.length) return { expired: 0 };
  const batch = col(ctx.uid, 'items').firestore.batch();
  for (const i of stale) batch.set(col(ctx.uid, 'items').doc(i.id), { status: 'filed', tags: [...new Set([...(i.tags ?? []), 'expired'])], expiredAt: now() }, { merge: true });
  await batch.commit();
  await audit(ctx.uid, { actor: 'brain', action: `auto-filed ${stale.length} item(s) older than ${ctx.profile.email.lookbackHours}h`, reason: 'inbox window (P0 items kept)' });
  return { expired: stale.length };
};
