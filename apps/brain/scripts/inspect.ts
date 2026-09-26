import { firestore } from '../src/lib/firestore';
import { getAuth } from 'firebase-admin/auth';
const db = firestore();
const users = await db.collection('users').get();
for (const u of users.docs) {
  const d = u.data();
  const subs = await u.ref.listCollections();
  const auth = await getAuth().getUser(u.id).catch(() => null);
  console.log(u.id, '|', d.email, '| onboarding:', d.onboardingComplete, '| status:', d.status, '| subcollections:', subs.map((c) => c.id).join(','), '| verified:', auth?.emailVerified, '| providers:', auth?.providerData.map((p) => p.providerId).join(','), '| claims:', JSON.stringify(auth?.customClaims ?? {}));
}
console.log('invites:', (await db.collection('invites').get()).docs.map((d) => `${d.id}:${d.data().usedBy ? 'used' : 'open'}`).join(', ') || 'none');
process.exit(0);
