import { createHash } from 'node:crypto';
import { userRef, col, now, audit, listDocs } from '../lib/firestore';
import { drive, type DriveFile } from '../lib/drive';
import { runAs } from '../lib/runas';
import { config } from '../config';
import type { UserContext } from '../lib/context';

const safeName = (n: string) => n.replace(/[\/\\\0]/g, '_').replace(/^\.+/, '_').slice(0, 120);

/** drive.provision — <parent>/<slug>/ and /inbox/ under the owner's shared parent, shared with the user's Google email. */
export const driveProvision = async (ctx: UserContext, payload: { force?: boolean }) => {
  if (!config.driveParentFolderId) return { skipped: 'ATLAS_DRIVE_PARENT_FOLDER_ID not set' };
  const u = (await userRef(ctx.uid).get()).data() ?? {};
  const prov = u.provisioning ?? {};
  if (prov.driveFolderId && !payload.force) return { skipped: 'already', driveFolderId: prov.driveFolderId };
  const slug = prov.slug; if (!slug) throw new Error('Linux provisioning must run first');
  const userFolder = await drive.ensureFolder(config.driveParentFolderId, slug);
  const inbox = await drive.ensureFolder(userFolder.id, 'inbox');
  if (u.email) await drive.share(userFolder.id, String(u.email), 'writer');
  await userRef(ctx.uid).set({ provisioning: { ...prov, driveFolderId: userFolder.id, driveInboxFolderId: inbox.id, driveAt: now() } }, { merge: true });
  await audit(ctx.uid, { actor: 'brain', action: `Drive folders ready: ${slug}/ and ${slug}/inbox/`, reason: `shared with ${u.email}` });
  return { driveFolderId: userFolder.id, driveInboxFolderId: inbox.id };
};

type Sidecar = { id: string; path: string; md5?: string; modifiedTime?: string; projectId?: string; folderId: string; name: string };

/** Map a Drive subfolder under the user root to a local project directory (creating the Atlas project if new). */
const projectDirFor = async (ctx: UserContext, prov: any, folder: DriveFile | null): Promise<{ dir: string; projectId?: string }> => {
  if (!folder || folder.id === prov.driveInboxFolderId) return { dir: `${prov.projectsPath}/inbox` };
  const projects = await listDocs(ctx.uid, 'projects');
  let p = projects.find((x: any) => x.driveFolderId === folder.id) as any;
  if (!p) {
    const byName = projects.find((x: any) => x.name === folder.name) as any;
    const ref = byName ? col(ctx.uid, 'projects').doc(byName.id) : col(ctx.uid, 'projects').doc();
    const dirName = safeName(folder.name).toLowerCase().replace(/\s+/g, '-');
    await ref.set({ ...(byName ? {} : { name: folder.name, goal: '', status: 'active', keyResultIds: [], isMaintenance: false, order: Date.now(), createdAt: now() }), driveFolderId: folder.id, path: `${prov.projectsPath}/${dirName}` }, { merge: true });
    p = { id: ref.id, path: `${prov.projectsPath}/${dirName}` };
  }
  return { dir: p.path ?? `${prov.projectsPath}/${safeName(folder.name)}`, projectId: p.id };
};

/** drive.pull — download new/changed files from the user's Drive folder into their Pi project dirs (as the user). */
export const drivePull = async (ctx: UserContext) => {
  const u = (await userRef(ctx.uid).get()).data() ?? {}; const prov = u.provisioning ?? {};
  if (!prov.driveFolderId || !prov.projectsPath) return { skipped: 'not provisioned for Drive' };
  const known = new Map((await listDocs<Sidecar>(ctx.uid, 'driveFiles')).map((f) => [f.id, f]));
  let pulled = 0, skipped = 0, failed = 0; const touched: string[] = [];
  const walk = async (folderId: string, folder: DriveFile | null, depth: number) => {
    if (depth > 3) return;
    for (const f of await drive.list(folderId)) {
      if (drive.isFolder(f)) { if (depth === 0 || f.id === prov.driveInboxFolderId) await walk(f.id, depth === 0 ? f : folder, depth + 1); continue; }
      const k = known.get(f.id);
      const stamp = f.md5Checksum ?? f.modifiedTime ?? '';
      if (k && (k.md5 ?? k.modifiedTime) === stamp) { skipped++; continue; }
      try {
        const { dir, projectId } = await projectDirFor(ctx, prov, depth === 0 ? null : folder);
        const name = safeName(drive.exportName(f));
        const { buffer } = await drive.download(f.id, f.mimeType);
        const r = await runAs(prov.slug, prov.projectsPath, ['sh', '-c', `mkdir -p "$1" && base64 -d > "$1/$2"`, 'sh', dir, name], { stdin: buffer.toString('base64'), timeoutMs: 120_000 });
        if (r.code !== 0) throw new Error(r.stderr.slice(0, 200));
        await col(ctx.uid, 'driveFiles').doc(f.id).set({ id: f.id, name, path: `${dir}/${name}`, md5: f.md5Checksum ?? null, modifiedTime: f.modifiedTime ?? null, projectId: projectId ?? null, folderId, pulledAt: now() } as Sidecar & { pulledAt: string });
        pulled++; touched.push(`${dir.split('/').slice(-1)[0]}/${name}`);
      } catch (e) { failed++; await audit(ctx.uid, { actor: 'brain', action: `drive pull failed: ${f.name}`, reason: String(e).slice(0, 200) }); }
    }
  };
  await walk(prov.driveFolderId, null, 0);
  await userRef(ctx.uid).set({ provisioning: { ...prov, driveLastPullAt: now(), driveLastPull: { pulled, skipped, failed } } }, { merge: true });
  if (pulled || failed) await audit(ctx.uid, { actor: 'brain', action: `Drive pull: ${pulled} file(s) downloaded${failed ? `, ${failed} failed` : ''}`, reason: touched.slice(0, 8).join(', ') });
  return { pulled, skipped, failed };
};

/** drive.push — upload files created/changed on the Pi (in projects/*) back to the matching Drive folder. */
export const drivePush = async (ctx: UserContext) => {
  const u = (await userRef(ctx.uid).get()).data() ?? {}; const prov = u.provisioning ?? {};
  if (!prov.driveFolderId || !prov.projectsPath) return { skipped: 'not provisioned for Drive' };
  const known = await listDocs<Sidecar>(ctx.uid, 'driveFiles');
  const byPath = new Map(known.map((f) => [f.path, f]));
  const projects = (await listDocs(ctx.uid, 'projects')).filter((p: any) => p.driveFolderId && p.path) as any[];
  const dirs: Array<{ dir: string; folderId: string }> = [{ dir: `${prov.projectsPath}/inbox`, folderId: prov.driveInboxFolderId }, ...projects.map((p) => ({ dir: p.path, folderId: p.driveFolderId }))];
  let pushed = 0, failed = 0;
  for (const { dir, folderId } of dirs) {
    const ls = await runAs(prov.slug, prov.projectsPath, ['sh', '-c', `[ -d "$1" ] && cd "$1" && find . -maxdepth 1 -type f -size -25M ! -name '.*' -printf '%f\\n' | while read -r f; do printf '%s %s\\n' "$(md5sum "$f" | cut -d' ' -f1)" "$f"; done || true`, 'sh', dir]);
    for (const line of ls.stdout.split('\n').filter(Boolean)) {
      const [md5, ...rest] = line.split(' '); const name = rest.join(' '); const path = `${dir}/${name}`;
      const k = byPath.get(path);
      if (k && k.md5 === md5) continue;
      try {
        const cat = await runAs(prov.slug, prov.projectsPath, ['sh', '-c', 'base64 "$1"', 'sh', path]);
        const content = Buffer.from(cat.stdout, 'base64');
        const f = await drive.upload(folderId, name, content, 'application/octet-stream', k?.id);
        await col(ctx.uid, 'driveFiles').doc(f.id).set({ id: f.id, name, path, md5: f.md5Checksum ?? md5, modifiedTime: f.modifiedTime ?? now(), folderId, pushedAt: now() }, { merge: true });
        pushed++;
      } catch (e) { failed++; await audit(ctx.uid, { actor: 'brain', action: `drive push failed: ${name}`, reason: String(e).slice(0, 200) }); }
    }
  }
  if (pushed || failed) await audit(ctx.uid, { actor: 'brain', action: `Drive push: ${pushed} file(s) uploaded${failed ? `, ${failed} failed` : ''}` });
  return { pushed, failed };
};

export const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
