/** Diagnose Firebase project state with the service account: API enabled? which Firestore databases exist? */
import { readFileSync } from 'node:fs';
import { cert } from 'firebase-admin/app';
const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (file ? readFileSync(file, 'utf8') : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64 ?? '', 'base64').toString('utf8')));
console.log('service account:', sa.client_email, '| project:', sa.project_id, '| key id:', sa.private_key_id);
const { access_token } = await cert(sa).getAccessToken();
const get = async (url: string) => { const r = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } }); return { status: r.status, body: (await r.text()).slice(0, 600) }; };
console.log('firestore API :', JSON.stringify(await get(`https://serviceusage.googleapis.com/v1/projects/${sa.project_id}/services/firestore.googleapis.com`)));
console.log('databases     :', JSON.stringify(await get(`https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases`)));
console.log('auth users    :', JSON.stringify(await get(`https://identitytoolkit.googleapis.com/v1/projects/${sa.project_id}/accounts:batchGet?maxResults=5`)).slice(0, 700));
process.exit(0);
