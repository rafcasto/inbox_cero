/** Usage: pnpm exec tsx scripts/invite.ts [email] — creates an invite code (bootstrap the first account). */
import { randomBytes } from 'node:crypto';
import { firestore } from '../src/lib/firestore';
const code = randomBytes(4).toString('hex').toUpperCase();
await firestore().collection('invites').doc(code).set({ email: process.argv[2] ?? null, createdBy: 'cli', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 86400e3).toISOString(), usedBy: null });
console.log(code);
process.exit(0);
