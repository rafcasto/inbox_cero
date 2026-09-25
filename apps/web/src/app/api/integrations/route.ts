import { adminDb, handle, requireUser, nowIso, audit, HttpError } from '@/lib/server/admin';
import { seal } from '@/lib/server/crypto';
import { enqueueJob } from '@/lib/server/upstash';
import { z } from 'zod';
const Body = z.object({ type: z.enum(['imap']), label: z.string().min(1), config: z.record(z.any()), secret: z.string().min(1), id: z.string().optional() });
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const b = Body.safeParse(await req.json());
  if (!b.success) throw new HttpError(400, b.error.message);
  const ref = b.data.id ? adminDb().collection('users').doc(uid).collection('integrations').doc(b.data.id) : adminDb().collection('users').doc(uid).collection('integrations').doc();
  await ref.set({ type: b.data.type, label: b.data.label, config: b.data.config, secret: seal(b.data.secret), enabled: true, createdAt: nowIso(), cursor: null, lastError: null }, { merge: true });
  await audit(uid, `added ${b.data.type} integration ${b.data.label}`, { target: { collection: 'integrations', id: ref.id } });
  await enqueueJob({ userId: uid, type: 'email.poll', payload: { integrationId: ref.id } }).catch(() => {});
  return { ok: true, id: ref.id };
});
