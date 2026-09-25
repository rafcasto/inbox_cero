import { handle, requireUser } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const { title, body, tags } = await req.json();
  await enqueueJob({ userId: uid, type: 'knowledge.index', payload: { note: { title, body, tags: tags ?? [] } } });
  return { ok: true };
});
