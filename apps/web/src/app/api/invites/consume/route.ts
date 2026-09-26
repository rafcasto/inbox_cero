import { adminDb, handle, requireUser, nowIso, HttpError } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
export const POST = handle(async (req) => {
  const { uid, email } = await requireUser(req, { verified: false });
  const { code } = await req.json();
  const ref = adminDb().collection('invites').doc(String(code).toUpperCase());
  await adminDb().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpError(404, 'Invalid invite');
    const d = s.data()!;
    if (d.usedBy && d.usedBy !== uid) throw new HttpError(410, 'Invite already used');
    if (d.email && d.email.toLowerCase() !== email.toLowerCase()) throw new HttpError(403, 'Invite is for a different email');
    tx.set(ref, { usedBy: uid, usedAt: nowIso() }, { merge: true });
    tx.set(adminDb().collection('users').doc(uid), { invitedBy: d.createdBy ?? 'admin', inviteCode: ref.id, status: 'active' }, { merge: true });
  });
  await enqueueJob({ userId: uid, type: 'user.provision', payload: {} }).catch(() => {});
  return { ok: true };
});
