import { adminDb, adminAuth, handle, requireUser } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const db = adminDb();
  await db.recursiveDelete(db.collection('users').doc(uid));
  // Pi home + Drive folder: the brain locks the Linux user now and asks the admin before purging.
  await enqueueJob({ userId: uid, type: 'user.deprovision', payload: { purge: true } }).catch(() => {});
  await adminAuth().deleteUser(uid);
  return { ok: true };
});
