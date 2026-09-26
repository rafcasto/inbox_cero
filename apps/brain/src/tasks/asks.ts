import { col, now, listDocs } from '../lib/firestore';
import { gaudit } from '../lib/governance';
import type { UserContext } from '../lib/context';
import { handlers } from './index';

/** Answer a parked ask: records provenance and executes the pending action if approved. */
export const askAnswer = async (ctx: UserContext, payload: { askId: string; answer: string; via?: 'portal' | 'whatsapp' }) => {
  const ref = col(ctx.uid, 'asks').doc(payload.askId);
  const a = (await ref.get()).data();
  if (!a || a.status !== 'pending') return { skipped: 'not pending' };
  const opt = a.options.find((o: any) => o.key === payload.answer || o.label.toLowerCase() === payload.answer.toLowerCase());
  if (!opt) return { error: 'unknown option' };
  await ref.set({ status: 'answered', answer: opt.key, answeredVia: payload.via ?? 'portal', answeredAt: now() }, { merge: true });
  let result: unknown = null;
  const yes = opt.key === '1';
  switch (a.kind) {
    case 'approveAction':
      if (yes && a.pendingAction && handlers[a.pendingAction.type]) {
        result = await handlers[a.pendingAction.type]!(ctx, a.pendingAction.payload);
        await col(ctx.uid, 'approvals').add({ action: a.context?.action, fromDomain: a.context?.features?.fromDomain ?? '', at: now(), askId: payload.askId });
        const { maybePromote } = await import('../lib/governance');
        if (a.context?.action) await maybePromote(ctx, a.context.action, a.context.features ?? {});
      } else if (a.context?.itemId) {
        await col(ctx.uid, 'items').doc(a.context.itemId).set({ status: 'triaged' }, { merge: true }); // keep it in the inbox
      }
      break;
    case 'promoteRule':
      if (yes) { const g = ctx.profile.governance; await col(ctx.uid, 'profile').doc('main').set({ governance: { allow: [...g.allow, { id: `r${Date.now().toString(36)}`, action: a.context.action, match: a.context.match, note: 'promoted from repeated approvals', createdAt: now() }] } }, { merge: true }); }
      break;
    case 'resumeAutonomy':
      if (opt.key === '1') await col(ctx.uid, 'profile').doc('main').set({ governance: { paused: false, pausedReason: null, pausedAt: null } }, { merge: true });
      if (opt.key === '3') await col(ctx.uid, 'profile').doc('main').set({ governance: { paused: false, mode: 'ask' } }, { merge: true });
      break;
    case 'keepOrCancel':
      if (a.context?.recurringCostId) await col(ctx.uid, 'recurringCosts').doc(a.context.recurringCostId).set({ status: yes ? 'active' : 'cancelled', usageFlag: null }, { merge: true });
      break;
    default: break;
  }
  await gaudit(ctx.uid, { action: `ask answered: ${opt.label}`, approval: 'user', target: { collection: 'asks', id: payload.askId }, reason: a.question.slice(0, 100) });
  return { answered: opt.key, result };
};

export const pendingAsks = (uid: string) => listDocs(uid, 'asks', (q) => q.where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(10));
