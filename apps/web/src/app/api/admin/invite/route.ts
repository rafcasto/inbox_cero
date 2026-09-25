import { adminDb, handle, requireUser, nowIso } from '@/lib/server/admin';
import { randomBytes } from 'node:crypto';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req, { admin: true });
  const { email } = await req.json().catch(() => ({}));
  const code = randomBytes(4).toString('hex').toUpperCase();
  await adminDb().collection('invites').doc(code).set({ email: email || null, createdBy: uid, createdAt: nowIso(), expiresAt: new Date(Date.now() + 30 * 86400e3).toISOString(), usedBy: null });
  return { ok: true, code };
});
