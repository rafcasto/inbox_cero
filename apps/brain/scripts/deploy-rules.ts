/** Deploy firestore.rules, storage.rules and firestore.indexes.json with the service account via REST (no `firebase login`). */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert } from 'firebase-admin/app';
import { REPO_ROOT } from '../src/config';
const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (file ? readFileSync(file, 'utf8') : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 ?? '', 'base64').toString('utf8')));
const P = sa.project_id;
const { access_token } = await cert(sa).getAccessToken();
const call = async (method: string, url: string, body?: unknown) => { const r = await fetch(url, { method, headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { status: r.status, j }; };
const RULES = 'https://firebaserules.googleapis.com/v1';

const release = async (releaseName: string, fileName: string, content: string) => {
  const rs = await call('POST', `${RULES}/projects/${P}/rulesets`, { source: { files: [{ name: fileName, content }] } });
  if (rs.status !== 200) return console.log(`✗ ruleset ${fileName}:`, rs.status, JSON.stringify(rs.j).slice(0, 300));
  const rulesetName = rs.j.name;
  const full = `projects/${P}/releases/${releaseName}`;
  let rel = await call('PATCH', `${RULES}/${full}`, { release: { name: full, rulesetName } });
  if (rel.status === 404) rel = await call('POST', `${RULES}/projects/${P}/releases`, { name: full, rulesetName });
  console.log(rel.status === 200 ? `✔ ${releaseName} → ${rulesetName.split('/').pop()}` : `✗ release ${releaseName}: ${rel.status} ${JSON.stringify(rel.j).slice(0, 300)}`);
};
await release('cloud.firestore', 'firestore.rules', readFileSync(resolve(REPO_ROOT, 'firebase/firestore.rules'), 'utf8'));
const bucket = `${P}.firebasestorage.app`;
await release(`firebase.storage/${bucket}`, 'storage.rules', readFileSync(resolve(REPO_ROOT, 'firebase/storage.rules'), 'utf8'));

// Indexes
const idx = JSON.parse(readFileSync(resolve(REPO_ROOT, 'firebase/firestore.indexes.json'), 'utf8'));
let created = 0, existing = 0, failed = 0;
for (const i of idx.indexes) {
  const r = await call('POST', `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/collectionGroups/${i.collectionGroup}/indexes`, { queryScope: i.queryScope, fields: i.fields });
  if (r.status === 200) created++; else if (r.status === 409) existing++; else { failed++; console.log('✗ index', i.collectionGroup, r.status, JSON.stringify(r.j).slice(0, 200)); }
}
console.log(`indexes: ${created} created, ${existing} already existed, ${failed} failed (composite indexes build in the background for a few minutes)`);
process.exit(0);
