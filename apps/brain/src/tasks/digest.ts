import { krProgress } from '@atlas/schemas';
import { col, now, listDocs, audit } from '../lib/firestore';
import type { UserContext } from '../lib/context';
import { sendText } from '../lib/whatsapp';
import { financeMonthlyText, financeSnapshot } from './finance';

const P = { P0: 0, P1: 1, P2: 2, P3: 3 } as const;

export const todayText = async (ctx: UserContext) => {
  const [items, tasks] = await Promise.all([
    listDocs(ctx.uid, 'items', (q) => q.where('status', '==', 'triaged').limit(200)),
    listDocs(ctx.uid, 'tasks', (q) => q.where('column', 'in', ['thisWeek', 'inProgress', 'waitingOn'])),
  ]);
  const hot = items.filter((i: any) => ['P0', 'P1'].includes(i.triage?.priority)).sort((a: any, b: any) => P[a.triage.priority as keyof typeof P] - P[b.triage.priority as keyof typeof P]).slice(0, 3);
  const doing = tasks.filter((t: any) => t.column !== 'waitingOn').sort((a: any, b: any) => P[a.priority as keyof typeof P] - P[b.priority as keyof typeof P]).slice(0, 3);
  const waiting = tasks.filter((t: any) => t.column === 'waitingOn').slice(0, 3);
  return [
    `☀️ Today`,
    ...hot.map((i: any) => `• [${i.triage.priority}] ${i.summary || i.raw?.subject}`),
    ...doing.map((t: any) => `• ${t.title}`),
    waiting.length ? `Waiting on: ${waiting.map((t: any) => `${t.title} (${t.waitingOn || '?'})`).join('; ')}` : '',
    `Inbox: ${items.length} to triage.`,
  ].filter(Boolean).join('\n');
};

export const statusText = async (ctx: UserContext) => {
  const [objs, krs] = await Promise.all([listDocs(ctx.uid, 'objectives', (q) => q.where('status', '==', 'active')), listDocs(ctx.uid, 'keyResults')]);
  if (!objs.length) return 'No objectives set this quarter yet. Say "plan quarter" to start.';
  return objs.map((o: any) => {
    const ks = krs.filter((k: any) => k.objectiveId === o.id) as any[];
    const avg = ks.length ? Math.round((ks.reduce((a, k) => a + krProgress(k), 0) / ks.length) * 100) : 0;
    const conf = ks.length ? (ks.reduce((a, k) => a + (k.confidence ?? 5), 0) / ks.length).toFixed(1) : '–';
    return `${o.title}: ${avg}% · confidence ${conf}/10\n${ks.map((k) => `  – ${k.title}: ${k.current}/${k.target}`).join('\n')}`;
  }).join('\n');
};

/** Morning digest to WhatsApp (n8n schedules per user). */
export const digestDaily = async (ctx: UserContext) => {
  if (!ctx.profile.whatsapp.number) return { skipped: 'no number' };
  const text = await todayText(ctx);
  const r = await sendText(ctx.profile.whatsapp.number, text, { quiet: ctx.profile.whatsapp.quietHours });
  await audit(ctx.uid, { actor: 'brain', action: 'sent daily digest' });
  return { sent: !('skipped' in (r as any)), text };
};

/** Finance nudges: weekly receipts / unreviewed, monthly income. payload.kind decides. */
export const nudgeFinance = async (ctx: UserContext, payload: { kind: 'receipts' | 'income' | 'unreviewed' | 'renewals' }) => {
  const f = ctx.profile.finance;
  if (!ctx.profile.whatsapp.number) return { skipped: 'no number' };
  let text = '';
  if (payload.kind === 'receipts' && f.nudges.receipts !== 'off') text = '🧾 Any receipts to submit this week? Send a photo or forward the email.';
  if (payload.kind === 'income' && f.nudges.income !== 'off') text = '💰 Time to record this month\'s income. Reply with amounts or upload your bank CSV in Atlas → Finance.';
  if (payload.kind === 'unreviewed' && f.nudges.unreviewed !== 'off') {
    const s = await financeSnapshot(ctx, {});
    if (s.unreviewed > 0) text = `📒 ${s.unreviewed} transactions are unreviewed this month. 2 minutes in Atlas → Finance clears them.`;
  }
  if (payload.kind === 'renewals') {
    const in7 = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10);
    const due = (await listDocs(ctx.uid, 'recurringCosts', (q) => q.where('status', '==', 'active'))).filter((r: any) => r.nextRenewalAt >= now().slice(0, 10) && r.nextRenewalAt <= in7);
    const unused = due.filter((r: any) => r.usageFlag === 'unused60d');
    if (due.length) text = `🔁 Renewing in 7 days: ${due.map((r: any) => `${r.vendor} $${r.amount} (${r.nextRenewalAt})`).join('; ')}.` + (unused.length ? ` ⚠ Unused lately: ${unused.map((r: any) => r.vendor).join(', ')} — keep or cancel?` : '');
  }
  if (!text) return { skipped: 'nothing to say' };
  await sendText(ctx.profile.whatsapp.number, text, { quiet: ctx.profile.whatsapp.quietHours });
  await audit(ctx.uid, { actor: 'brain', action: `finance nudge: ${payload.kind}` });
  return { sent: true };
};

export const financeMonthly = async (ctx: UserContext) => {
  const text = await financeMonthlyText(ctx);
  if (ctx.profile.whatsapp.number) await sendText(ctx.profile.whatsapp.number, text, { quiet: ctx.profile.whatsapp.quietHours });
  await audit(ctx.uid, { actor: 'brain', action: 'sent monthly finance summary' });
  return { text };
};
