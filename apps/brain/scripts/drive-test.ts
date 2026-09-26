/** Can the service account see the shared parent folder, create a subfolder in it, and share it? Cleans up after itself. */
import { saAccessToken, DRIVE_SCOPE } from '../src/lib/google-sa';
const PARENT = process.argv[2]!;
const access_token = await saAccessToken([DRIVE_SCOPE]);
const api = async (method: string, path: string, body?: unknown) => { const r = await fetch(`https://www.googleapis.com/drive/v3/${path}`, { method, headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); return { status: r.status, j }; };
const parent = await api('GET', `files/${PARENT}?fields=id,name,owners(emailAddress),capabilities(canAddChildren,canShare),permissions(emailAddress,role)`);
console.log('parent:', parent.status, JSON.stringify(parent.j).slice(0, 400));
const created = await api('POST', 'files?fields=id,name,owners(emailAddress),parents', { name: '_atlas-sa-test', mimeType: 'application/vnd.google-apps.folder', parents: [PARENT] });
console.log('create subfolder:', created.status, JSON.stringify(created.j).slice(0, 300));
if (created.status === 200) {
  const share = await api('POST', `files/${created.j.id}/permissions?sendNotificationEmail=false`, { role: 'writer', type: 'user', emailAddress: 'rafcasto@gmail.com' });
  console.log('share with user:', share.status, JSON.stringify(share.j).slice(0, 200));
  const del = await api('DELETE', `files/${created.j.id}`);
  console.log('cleanup:', del.status);
}
const scope = await api('GET', `about?fields=user(emailAddress),storageQuota`);
console.log('sa identity:', JSON.stringify(scope.j).slice(0, 200));
process.exit(0);
