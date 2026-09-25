/** End-to-end smoke: seed a user in the Firestore emulator, triage 3 fake emails through rules + Claude, print results. */
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_PROJECT_ID ??= 'demo-atlas';
process.env.GCLOUD_PROJECT ??= 'demo-atlas';
import { firestore, col } from '../src/lib/firestore';
import { loadContext } from '../src/lib/context';
import { triageItems } from '../src/tasks/triage';

const uid = 'smoke-user';
const db = firestore();
await db.collection('users').doc(uid).set({ email: 'smoke@x.io', status: 'active', createdAt: new Date().toISOString(), timezone: 'Pacific/Auckland', onboardingComplete: true });
await col(uid, 'profile').doc('main').set({ identity: { name: 'Rafael', roles: ['founder'], currentPriorities: ['launch Atlas'] }, noise: { neverSurface: ['promo@'], alwaysSurface: ['accountant'] }, ai: { models: { triage: process.env.SMOKE_MODEL ?? 'claude-haiku-4-5' } } });
await col(uid, 'projects').doc('atlas').set({ name: 'Atlas', goal: 'Ship the Chief of Staff', status: 'active', keyResultIds: [], isMaintenance: false });
const ctx = await loadContext(uid);
const items = [
  { id: 'e1', from: 'Jane Accountant <jane@accountant.co.nz>', subject: 'GST return due Friday — need your receipts', receivedAt: new Date().toISOString(), snippet: 'Hi Rafael, your GST return is due on Friday. Please send me the September receipts by Thursday. Thanks, Jane', hasListUnsubscribe: false },
  { id: 'e2', from: 'Deals <promo@bigstore.com>', subject: '50% off everything — last chance!', receivedAt: new Date().toISOString(), snippet: 'Our biggest sale ends tonight. Unsubscribe here.', hasListUnsubscribe: true },
  { id: 'e3', from: 'Vercel <invoice@vercel.com>', subject: 'Your receipt from Vercel #1234', receivedAt: new Date().toISOString(), snippet: 'Amount paid $20.00 USD for Pro plan.', hasListUnsubscribe: false },
  { id: 'e4', from: 'Sam <sam@client.io>', subject: 'Can we move Thursday\'s workshop?', receivedAt: new Date().toISOString(), snippet: 'Hey, something came up — could we shift the workshop to next Tuesday? Let me know what works.', hasListUnsubscribe: false },
];
const t0 = Date.now();
const r = await triageItems(ctx, { items });
console.log(JSON.stringify({ ms: Date.now() - t0, ...r }, null, 1));
for (const it of items) { const d = (await col(uid, 'items').doc(it.id).get()).data(); console.log(it.id, '→', d?.status, d?.triage?.priority, d?.triage?.action, '|', d?.summary, '|', d?.triage?.model, '|', d?.triage?.reasoning); }
const usage = await col(uid, 'usageLogs').get(); console.log('usageLogs:', usage.docs.map((d) => d.data()));
process.exit(0);
