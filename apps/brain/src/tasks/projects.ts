import { spawn } from 'node:child_process';
import { col, userRef, now, listDocs, audit } from '../lib/firestore';
import { runAs } from '../lib/runas';
import { drive } from '../lib/drive';
import { event } from '../lib/events';
import { resolveModel } from '../lib/runner';
import { logUsage } from '../lib/firestore';
import { config } from '../config';
import type { UserContext } from '../lib/context';

const dirNameOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';
const prov = async (uid: string) => { const p = ((await userRef(uid).get()).data() ?? {}).provisioning ?? {}; if (!p.slug || !p.projectsPath) throw new Error('user is not provisioned on the Pi yet'); return p as { slug: string; projectsPath: string; driveFolderId?: string; driveInboxFolderId?: string }; };
const safeRel = (s: string) => { if (!s || s.includes('..') || s.startsWith('/') || s.includes('\0')) throw new Error('bad path'); return s; };

/** project.provision — directory on the Pi (as the user) + Drive subfolder (when Drive is enabled). */
export const projectProvision = async (ctx: UserContext, payload: { projectId: string }) => {
  const p = await prov(ctx.uid);
  const ref = col(ctx.uid, 'projects').doc(payload.projectId);
  const proj = (await ref.get()).data(); if (!proj) throw new Error('project not found');
  const dirName = proj.dirName ?? dirNameOf(proj.name);
  const path = proj.path ?? `${p.projectsPath}/${dirName}`;
  const r = await runAs(p.slug, p.projectsPath, ['sh', '-c', 'mkdir -p "$1" && [ -f "$1/CLAUDE.md" ] || printf "# %s\\n\\n%s\\n" "$2" "$3" > "$1/CLAUDE.md"', 'sh', path, proj.name, proj.goal ?? '']);
  if (r.code !== 0) throw new Error(`mkdir failed: ${r.stderr.slice(0, 200)}`);
  let driveFolderId = proj.driveFolderId as string | undefined; let driveNote = '';
  if (!driveFolderId && p.driveFolderId && config.driveParentFolderId) {
    try { driveFolderId = (await drive.ensureFolder(p.driveFolderId, proj.name)).id; } catch (e) { driveNote = `drive: ${String(e).slice(0, 120)}`; }
  }
  await ref.set({ dirName, path, driveFolderId: driveFolderId ?? null, provisionedAt: now() }, { merge: true });
  await event(ctx.uid, { actionType: 'provision', action: `project "${proj.name}" ready on the Pi${driveFolderId ? ' and in Drive' : ''}`, projectId: ref.id, reason: driveNote || path });
  return { path, driveFolderId: driveFolderId ?? null, driveNote };
};

/** project.backfill — provision every active project that lacks a path or a Drive folder. */
export const projectBackfill = async (ctx: UserContext) => {
  const projects = await listDocs(ctx.uid, 'projects', (q) => q.where('status', 'in', ['active', 'paused']));
  let done = 0;
  for (const pr of projects as any[]) if (!pr.path || !pr.driveFolderId) { try { await projectProvision(ctx, { projectId: pr.id }); done++; } catch (e) { await audit(ctx.uid, { actor: 'brain', action: `backfill failed for ${pr.name}`, reason: String(e).slice(0, 160) }); } }
  return { provisioned: done, total: projects.length };
};

/** project.files — list files in a project directory (or inbox when projectId = "inbox"), as the user. */
export const projectFiles = async (ctx: UserContext, payload: { projectId: string }) => {
  const p = await prov(ctx.uid);
  const path = payload.projectId === 'inbox' ? `${p.projectsPath}/inbox` : ((await col(ctx.uid, 'projects').doc(payload.projectId).get()).data()?.path as string | undefined);
  if (!path) return { files: [], path: null, note: 'project has no directory yet' };
  const r = await runAs(p.slug, p.projectsPath, ['sh', '-c', 'cd "$1" 2>/dev/null && find . -maxdepth 2 -type f ! -path "*/.*" -printf "%s\\t%TY-%Tm-%TdT%TH:%TM:%TSZ\\t%P\\n" | sort -k3 | head -500', 'sh', path]);
  const files = r.stdout.split('\n').filter(Boolean).map((l) => { const [size, mtime, rel] = l.split('\t'); return { rel, size: Number(size), mtime: (mtime ?? '').replace(/\.\d+Z$/, 'Z') }; });
  const drv = new Map((await listDocs(ctx.uid, 'driveFiles')).map((f: any) => [f.path, f.id]));
  if (payload.projectId !== 'inbox') await col(ctx.uid, 'projects').doc(payload.projectId).set({ fileCount: files.length }, { merge: true });
  return { path, files: files.map((f) => ({ ...f, driveFileId: drv.get(`${path}/${f.rel}`) ?? null })) };
};

/** file.move — move a file between projects (or inbox) on the Pi and in Drive. */
export const fileMove = async (ctx: UserContext, payload: { path: string; toProjectId: string }) => {
  const p = await prov(ctx.uid);
  const from = payload.path; if (!from.startsWith(p.projectsPath + '/')) throw new Error('path outside projects');
  const toDir = payload.toProjectId === 'inbox' ? `${p.projectsPath}/inbox` : ((await col(ctx.uid, 'projects').doc(payload.toProjectId).get()).data()?.path as string | undefined);
  if (!toDir) throw new Error('destination project has no directory yet');
  const name = from.split('/').pop()!; const to = `${toDir}/${name}`;
  const r = await runAs(p.slug, p.projectsPath, ['sh', '-c', 'mkdir -p "$2" && mv -n "$1" "$2/"', 'sh', from, toDir]);
  if (r.code !== 0) throw new Error(`move failed: ${r.stderr.slice(0, 200)}`);
  // Drive side via the sidecar map
  const side = (await listDocs(ctx.uid, 'driveFiles')).find((f: any) => f.path === from) as any;
  let driveNote = 'not in Drive yet (next push will upload)';
  if (side) {
    const toFolder = payload.toProjectId === 'inbox' ? p.driveInboxFolderId : ((await col(ctx.uid, 'projects').doc(payload.toProjectId).get()).data()?.driveFolderId as string | undefined);
    if (toFolder && side.folderId && toFolder !== side.folderId) { try { await drive.move(side.id, side.folderId, toFolder); driveNote = 'moved in Drive'; } catch (e) { driveNote = `Drive move failed: ${String(e).slice(0, 120)}`; } }
    await col(ctx.uid, 'driveFiles').doc(side.id).set({ path: to, folderId: toFolder ?? side.folderId, projectId: payload.toProjectId === 'inbox' ? null : payload.toProjectId }, { merge: true });
  }
  await event(ctx.uid, { actionType: 'file.move', action: `moved ${name} → ${payload.toProjectId === 'inbox' ? 'inbox' : 'project'}`, projectId: payload.toProjectId === 'inbox' ? null : payload.toProjectId, ref: to, reason: driveNote });
  return { from, to, driveNote };
};

/** project.run — one non-interactive Claude turn inside the project directory, as the user, resuming the project's session. */
export const projectRun = async (ctx: UserContext, payload: { projectId: string; prompt: string; fresh?: boolean; model?: string }) => {
  const p = await prov(ctx.uid);
  const ref = col(ctx.uid, 'projects').doc(payload.projectId);
  const proj = (await ref.get()).data(); if (!proj?.path) throw new Error('project has no directory yet — provision it first');
  const model = resolveModel(ctx, 'sessions', payload.model);
  const runRef = await col(ctx.uid, 'projectRuns').add({ projectId: ref.id, prompt: payload.prompt, status: 'running', at: now(), model });
  const t0 = Date.now();
  const args = ['claude', '-p', payload.prompt, '--model', model, '--output-format', 'json', '--max-turns', '12', '--strict-mcp-config', '--setting-sources', 'user,project', '--permission-mode', 'acceptEdits'];
  if (proj.claudeSessionId && !payload.fresh) args.push('--resume', proj.claudeSessionId);
  const r = await runAs(p.slug, proj.path, args, { timeoutMs: 15 * 60_000 });
  let out: any = null; try { out = JSON.parse(r.stdout.trim().split('\n').pop() ?? ''); } catch { /* not JSON */ }
  const ok = r.code === 0 && out && !out.is_error;
  const changed = (await runAs(p.slug, proj.path, ['sh', '-c', 'find . -type f ! -path "*/.*" -newermt "@$1" -printf "%P\\n" | head -50', 'sh', String(Math.floor(t0 / 1000))])).stdout.split('\n').filter(Boolean);
  const cost = Number(out?.total_cost_usd ?? 0);
  await runRef.set({ status: ok ? 'ok' : 'error', result: ok ? String(out.result ?? '') : String(out?.result ?? r.stderr ?? 'failed').slice(0, 2000), sessionId: out?.session_id ?? proj.claudeSessionId ?? null, costUsd: cost, durationMs: Date.now() - t0, filesChanged: changed, error: ok ? null : String(out?.result ?? r.stderr).slice(0, 300) }, { merge: true });
  if (out?.session_id) await ref.set({ claudeSessionId: out.session_id, lastRunAt: now() }, { merge: true });
  if (out?.usage) await logUsage(ctx.uid, { task: 'project.run', model: Object.keys(out.modelUsage ?? {})[0] ?? model, tokensIn: (out.usage.input_tokens ?? 0) + (out.usage.cache_creation_input_tokens ?? 0) + (out.usage.cache_read_input_tokens ?? 0), tokensOut: out.usage.output_tokens ?? 0, costUsd: cost, refId: runRef.id });
  await event(ctx.uid, { actionType: 'agent.run', action: `${ok ? 'ran' : 'failed'} in "${proj.name}": ${payload.prompt.slice(0, 80)}`, projectId: ref.id, ref: runRef.id, reason: changed.length ? `changed ${changed.length} file(s)` : undefined, costUsd: cost, model, approval: 'user' });
  return { runId: runRef.id, ok, result: ok ? String(out.result ?? '') : undefined, error: ok ? undefined : String(out?.result ?? r.stderr).slice(0, 300), filesChanged: changed, sessionId: out?.session_id };
};

export const _spawn = spawn;
