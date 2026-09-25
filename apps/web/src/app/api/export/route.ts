import { adminDb, handle, requireUser } from '@/lib/server/admin';
const COLLECTIONS = ['profile', 'items', 'feedback', 'areas', 'projects', 'tasks', 'objectives', 'keyResults', 'krUpdates', 'sessions', 'categories', 'transactions', 'recurringCosts', 'financeSnapshots', 'bankImports', 'content', 'contentMetrics', 'knowledge', 'audit', 'usageLogs', 'flags', 'vendorMemory'];
export const GET = handle(async (req) => {
  const { uid } = await requireUser(req);
  const user = adminDb().collection('users').doc(uid);
  const out: Record<string, unknown> = { user: (await user.get()).data(), exportedAt: new Date().toISOString() };
  for (const c of COLLECTIONS) out[c] = (await user.collection(c).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return new Response(JSON.stringify(out, null, 1), { headers: { 'Content-Type': 'application/json', 'Content-Disposition': 'attachment; filename="atlas-export.json"' } });
});
