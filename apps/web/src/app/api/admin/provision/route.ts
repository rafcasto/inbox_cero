import { handle, requireUser } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
export const POST = handle(async (req) => {
  await requireUser(req, { admin: true });
  const { uid, force } = await req.json();
  const id = await enqueueJob({ userId: uid, type: 'user.provision', payload: { force: Boolean(force) } });
  return { ok: true, id };
});
