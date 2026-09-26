import { readFileSync } from 'node:fs';
import { cert } from 'firebase-admin/app';
const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (file ? readFileSync(file, 'utf8') : ''));
const { access_token } = await cert(sa).getAccessToken();
const get = async (url: string) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const rel = await get(`https://firebaserules.googleapis.com/v1/projects/${sa.project_id}/releases`);
console.log('releases:', rel.status, JSON.stringify((rel.json.releases ?? []).map((r: any) => ({ name: r.name, ruleset: r.rulesetName?.split('/').pop(), updated: r.updateTime })), null, 0));
for (const r of rel.json.releases ?? []) {
  if (!r.name.includes('firestore')) continue;
  const rs = await get(`https://firebaserules.googleapis.com/v1/${r.rulesetName}`);
  const src = rs.json.source?.files?.[0]?.content ?? '';
  console.log(`--- ${r.name} (${src.length} chars):\n${src.slice(0, 700)}`);
}
const dbs = await get(`https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases`);
console.log('databases:', dbs.status, JSON.stringify(dbs.json).slice(0, 300));
process.exit(0);
