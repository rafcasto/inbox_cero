import { handle, requireUser } from '@/lib/server/admin';
import { redis } from '@/lib/server/upstash';

/** Pi/brain health for any signed-in user: heartbeat age, worker stats, queue depth. */
export const GET = handle(async (req) => {
  await requireUser(req);
  const r = redis();
  if (!r) return { ok: false, reason: 'Upstash not configured on the portal' };
  const [hb, pending, dlq] = await Promise.all([r.get<unknown>('atlas:heartbeat:pi'), r.xlen('atlas:jobs'), r.xlen('atlas:jobs:dlq')]);
  const beat = typeof hb === 'string' ? (hb.startsWith('{') ? JSON.parse(hb) : { at: hb }) : (hb as Record<string, unknown> | null);
  const ageSec = beat?.at ? Math.round((Date.now() - new Date(String(beat.at)).getTime()) / 1000) : null;
  const status = ageSec === null ? 'offline' : ageSec < 120 ? 'online' : 'stale';
  return { ok: status === 'online', status, ageSec, beat, pending, dlq };
});
