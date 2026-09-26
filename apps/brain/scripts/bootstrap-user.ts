/** Ensure users/{uid} exists for an existing Auth user (e.g. signed in with Google before Firestore existed). */
import { getAuth } from 'firebase-admin/auth';
import { firestore } from '../src/lib/firestore';
const db = firestore();
const u = await getAuth().getUserByEmail(process.argv[2]!);
const ref = db.collection('users').doc(u.uid);
const exists = (await ref.get()).exists;
await ref.set({ email: u.email, displayName: u.displayName ?? '', createdAt: new Date(u.metadata.creationTime).toISOString(), timezone: 'Pacific/Auckland', onboardingComplete: false, status: 'active', invitedBy: 'cli' }, { merge: true });
console.log(`${exists ? 'updated' : 'created'} users/${u.uid} for ${u.email}`);
process.exit(0);
