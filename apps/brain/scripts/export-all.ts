/** Backup helper: write every user's data as JSON into <dir>/<uid>.json (used by pi/atlas-backup.sh). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { firestore } from '../src/lib/firestore';
const dir = process.argv[2]; if (!dir) { console.error('dir required'); process.exit(1); }
mkdirSync(dir, { recursive: true });
const db = firestore();
const users = await db.collection('users').get();
for (const u of users.docs) {
  const out: Record<string, unknown> = { user: u.data() };
  for (const c of await u.ref.listCollections()) out[c.id] = (await c.get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  writeFileSync(join(dir, `${u.id}.json`), JSON.stringify(out));
}
writeFileSync(join(dir, 'invites.json'), JSON.stringify((await db.collection('invites').get()).docs.map((d) => ({ id: d.id, ...d.data() }))));
console.log(`exported ${users.size} users to ${dir}`);
process.exit(0);
