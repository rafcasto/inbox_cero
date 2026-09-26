import { adminDb, handle, requireUser } from '@/lib/server/admin';
import { piHealth, redis } from '@/lib/server/upstash';
export const GET = handle(async (req) => {
  await requireUser(req, { admin: true });
  const db = adminDb();
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const users = await Promise.all((await db.collection('users').get()).docs.map(async (d) => {
    const u = d.data();
    const [items, usage] = await Promise.all([d.ref.collection('items').count().get(), d.ref.collection('usageLogs').where('at', '>=', since).get()]);
    return { uid: d.id, email: u.email, status: u.status ?? 'active', lastSeenAt: u.lastSeenAt, items: items.data().count, calls: usage.size, cost: usage.docs.reduce((a, x) => a + (x.data().costUsd ?? 0), 0), admin: false, provisioning: u.provisioning ?? null };
  }));
  const invites = (await db.collection('invites').orderBy('createdAt', 'desc').limit(20).get()).docs.map((d) => ({ code: d.id, ...d.data() }));
  const health = await piHealth();
  let dlq: any[] = [];
  const r = redis();
  if (r) { const raw = (await r.xrevrange('atlas:jobs:dlq', '+', '-', 10)) as any; dlq = Object.values(raw ?? {}).map((f: any) => ({ job: safe(f.job), err: f.err })); }
  return { users, invites, health, dlq };
});
const safe = (s: any) => { try { return JSON.parse(s); } catch { return s; } };
