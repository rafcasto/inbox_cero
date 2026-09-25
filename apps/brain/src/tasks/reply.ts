import { z } from 'zod';
import { col, now, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';

const ReplyOut = z.object({ subject: z.string(), body: z.string(), tone: z.string().default('') });

/** Draft a reply for an email item; stored on the item as `draft`. Never sent automatically. */
export const replyDraft = async (ctx: UserContext, payload: { itemId: string }) => {
  const it = (await col(ctx.uid, 'items').doc(payload.itemId).get()).data();
  if (!it) throw new Error('item not found');
  const res = await runTask({ ctx, task: 'reply.draft', schema: ReplyOut, refId: payload.itemId, vars: { voice: ctx.profile.voice, from: it.raw?.from, subject: it.raw?.subject, body: (it.raw?.body ?? it.raw?.snippet ?? '').slice(0, 6000) } });
  await col(ctx.uid, 'items').doc(payload.itemId).set({ draft: { ...res.output, createdAt: now(), model: res.model } }, { merge: true });
  await audit(ctx.uid, { actor: 'brain', action: 'drafted reply', target: { collection: 'items', id: payload.itemId }, model: res.model });
  return res.output;
};
