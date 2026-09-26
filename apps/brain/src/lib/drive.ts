import type { TokenGetter } from './drive-auth';

const FOLDER = 'application/vnd.google-apps.folder';
export type DriveFile = { id: string; name: string; mimeType: string; md5Checksum?: string; modifiedTime?: string; size?: string; parents?: string[]; trashed?: boolean };

export const makeDrive = (getToken: TokenGetter) => {
const call = async (method: string, path: string, body?: unknown, raw = false): Promise<any> => {
  const token = await getToken();
  const r = await fetch(path.startsWith('http') ? path : `https://www.googleapis.com/drive/v3/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body && !raw ? { 'Content-Type': 'application/json' } : {}) }, body: body ? (raw ? (body as any) : JSON.stringify(body)) : undefined });
  if (raw) return r;
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Drive ${method} ${path.split('?')[0]} → ${r.status}: ${j.error?.message ?? 'error'}`);
  return j;
};

const drive = {
  get: (id: string) => call('GET', `files/${id}?fields=id,name,mimeType,md5Checksum,modifiedTime,size,parents,trashed&supportsAllDrives=true`) as Promise<DriveFile>,
  /** Children of a folder (non-trashed). */
  list: async (parentId: string): Promise<DriveFile[]> => {
    const out: DriveFile[] = []; let pageToken = '';
    do {
      const j = await call('GET', `files?q=${encodeURIComponent(`'${parentId}' in parents and trashed = false`)}&fields=nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,size,parents)&pageSize=200&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`);
      out.push(...(j.files ?? [])); pageToken = j.nextPageToken ?? '';
    } while (pageToken);
    return out;
  },
  /** Find-or-create a subfolder by name. */
  ensureFolder: async (parentId: string, name: string): Promise<DriveFile> => {
    const existing = (await drive.list(parentId)).find((f) => f.mimeType === FOLDER && f.name === name);
    if (existing) return existing;
    return call('POST', 'files?fields=id,name,mimeType,parents&supportsAllDrives=true', { name, mimeType: FOLDER, parents: [parentId] });
  },
  share: (fileId: string, emailAddress: string, role: 'reader' | 'writer' = 'writer') =>
    call('POST', `files/${fileId}/permissions?sendNotificationEmail=false&supportsAllDrives=true`, { role, type: 'user', emailAddress }).catch((e) => { if (!String(e).includes('already')) throw e; }),
  download: async (fileId: string, mimeType: string): Promise<{ buffer: Buffer; name?: string }> => {
    // Google-native docs are exported; everything else is downloaded as-is.
    const exportMime: Record<string, string> = { 'application/vnd.google-apps.document': 'text/markdown', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'application/pdf' };
    const path = exportMime[mimeType] ? `files/${fileId}/export?mimeType=${encodeURIComponent(exportMime[mimeType]!)}` : `files/${fileId}?alt=media&supportsAllDrives=true`;
    const r = (await call('GET', path, undefined, true)) as Response;
    if (!r.ok) throw new Error(`Drive download ${fileId} → ${r.status}`);
    return { buffer: Buffer.from(await r.arrayBuffer()) };
  },
  /** Create or update a file's content (multipart upload). */
  upload: async (parentId: string, name: string, content: Buffer, mimeType = 'application/octet-stream', existingId?: string): Promise<DriveFile> => {
    const boundary = `atlas${Date.now()}`;
    const meta = existingId ? {} : { name, parents: [parentId] };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--`),
    ]);
    const token = await getToken();
    const url = `https://www.googleapis.com/upload/drive/v3/files${existingId ? `/${existingId}` : ''}?uploadType=multipart&fields=id,name,md5Checksum,modifiedTime&supportsAllDrives=true`;
    const r = await fetch(url, { method: existingId ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Drive upload ${name} → ${r.status}: ${(j as any).error?.message ?? 'error'}`);
    return j as DriveFile;
  },
  move: (fileId: string, fromParent: string, toParent: string) => call('PATCH', `files/${fileId}?addParents=${toParent}&removeParents=${fromParent}&fields=id,parents&supportsAllDrives=true`, {}),
  exportName: (f: DriveFile) => { const ext: Record<string, string> = { 'application/vnd.google-apps.document': '.md', 'application/vnd.google-apps.spreadsheet': '.csv', 'application/vnd.google-apps.presentation': '.pdf' }; return f.name + (ext[f.mimeType] ?? ''); },
  isFolder: (f: DriveFile) => f.mimeType === FOLDER,
};
return drive;
};
export type DriveClient = ReturnType<typeof makeDrive>;
