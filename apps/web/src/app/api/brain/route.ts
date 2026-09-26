import { handle, requireUser } from '@/lib/server/admin';
import { redis } from '@/lib/server/upstash';
import { enqueueJob } from '@/lib/server/upstash';

/**
 * Synchronous-feeling call to the Pi for interactive tasks (sessions): enqueue, then wait for the
 * result key the brain writes (atlas:result:<idempotencyKey>) for up to 90 s.
 */
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const { task, input, model } = await req.json();
  const r0 = redis()!;
  const hb0 = await r0.get<unknown>('atlas:heartbeat:pi');
  const beatAt = typeof hb0 === 'string' ? (hb0.startsWith('{') ? JSON.parse(hb0).at : hb0) : (hb0 as any)?.at;
  if (!beatAt || Date.now() - new Date(beatAt).getTime() > 120_000) throw new Error('The Pi brain is offline (no heartbeat in the last 2 minutes). Check the status dot in the sidebar.');
  const key = `${task}:${uid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  await enqueueJob({ userId: uid, type: task, payload: { ...input, __resultKey: key }, model, idempotencyKey: key });
  const r = redis()!;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const v = await r.get<any>(`atlas:result:${key}`);
    if (v) { await r.del(`atlas:result:${key}`); const parsed = typeof v === 'string' ? JSON.parse(v) : v; if (parsed.error) throw new Error(parsed.error); return { ok: true, output: parsed.output }; }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error('Pi did not respond in time. Is the brain online?');
});
export const maxDuration = 100;
