import { adminDb, handle, HttpError } from '@/lib/server/admin';
export const POST = handle(async (req) => {
  const { code } = await req.json();
  if (!code) throw new HttpError(400, 'code required');
  const s = await adminDb().collection('invites').doc(String(code).toUpperCase()).get();
  if (!s.exists) throw new HttpError(404, 'Invalid invite code');
  const d = s.data()!;
  if (d.usedBy) throw new HttpError(410, 'Invite already used');
  if (d.expiresAt && d.expiresAt < new Date().toISOString()) throw new HttpError(410, 'Invite expired');
  return { ok: true, email: d.email ?? null };
});
