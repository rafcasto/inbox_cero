import { handle, requireUser, audit } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
import { JobType } from '@atlas/schemas';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const { type, payload } = await req.json();
  const t = JobType.parse(type);
  const id = await enqueueJob({ userId: uid, type: t, payload: payload ?? {} });
  await audit(uid, `queued ${t}`, { target: { collection: 'jobs', id: String(id) } });
  return { ok: true, id };
});
