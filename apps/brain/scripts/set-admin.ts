/** Usage: pnpm exec tsx scripts/set-admin.ts <email>  — grants the `admin` custom claim (needs FIREBASE_SERVICE_ACCOUNT_B64 in .env). */
import { getAuth } from 'firebase-admin/auth';
import { firestore } from '../src/lib/firestore';
firestore();
const email = process.argv[2];
if (!email) { console.error('email required'); process.exit(1); }
const u = await getAuth().getUserByEmail(email);
await getAuth().setCustomUserClaims(u.uid, { ...(u.customClaims ?? {}), admin: true });
console.log(`admin claim set for ${email} (${u.uid}). Sign out/in in the portal to refresh.`);
process.exit(0);
