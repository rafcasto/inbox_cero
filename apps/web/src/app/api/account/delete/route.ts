import { adminDb, adminAuth, adminStorage, handle, requireUser } from '@/lib/server/admin';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const db = adminDb();
  await db.recursiveDelete(db.collection('users').doc(uid));
  await adminStorage().bucket().deleteFiles({ prefix: `users/${uid}/` }).catch(() => {});
  await adminAuth().deleteUser(uid);
  return { ok: true };
});
