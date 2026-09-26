import { saAccessToken, serviceAccount } from '../src/lib/google-sa';
const sa = serviceAccount();
const tok = await saAccessToken(['https://www.googleapis.com/auth/cloud-platform']);
const get = async (u: string) => { const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
const post = async (u: string, b: unknown) => { const r = await fetch(u, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
console.log('identity:', sa.client_email);
const info = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${tok}`).then((r) => r.json());
console.log('tokeninfo:', JSON.stringify({ email: info.email, scope: info.scope?.slice(0, 80) }));
const proj = await get(`https://cloudresourcemanager.googleapis.com/v1/projects/inboxcero-1b7a9`);
console.log('project:', proj.s, JSON.stringify({ number: proj.j.projectNumber, name: proj.j.name, state: proj.j.lifecycleState, err: proj.j.error?.message?.slice(0, 120) }));
const pol = await post(`https://cloudresourcemanager.googleapis.com/v1/projects/inboxcero-1b7a9:getIamPolicy`, {});
if (pol.s === 200) { for (const b of pol.j.bindings ?? []) if ((b.members ?? []).some((m: string) => m.includes('firebase-adminsdk-fbsvc'))) console.log('  role for SA:', b.role); }
else console.log('iam policy:', pol.s, pol.j.error?.message?.slice(0, 160));
const perms = await post(`https://cloudresourcemanager.googleapis.com/v1/projects/inboxcero-1b7a9:testIamPermissions`, { permissions: ['datastore.indexes.create', 'datastore.indexes.list', 'serviceusage.services.get', 'serviceusage.services.enable', 'firebaserules.releases.update'] });
console.log('testIamPermissions:', perms.s, JSON.stringify(perms.j.permissions ?? perms.j.error?.message?.slice(0, 160)));
const svc = await get(`https://serviceusage.googleapis.com/v1/projects/inboxcero-1b7a9/services?filter=state:ENABLED&pageSize=200`);
console.log('enabled APIs:', svc.s, svc.s === 200 ? (svc.j.services ?? []).map((x: any) => x.config?.name?.replace('.googleapis.com', '')).join(', ') : svc.j.error?.message?.slice(0, 160));
process.exit(0);
