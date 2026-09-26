import { spawn } from 'node:child_process';
import { log } from './log';

/**
 * Execute a command as a provisioned user via the root-owned helper (sudo rule: atlas → /usr/local/sbin/atlas-run).
 * cwd must be inside /home/u-<slug>/projects. Environment is rebuilt by the helper; nothing leaks from the brain.
 */
export const runAs = (slug: string, cwd: string, cmd: string[], opts: { timeoutMs?: number; stdin?: string } = {}) =>
  new Promise<{ code: number; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn('sudo', ['-n', '/usr/local/sbin/atlas-run', slug, cwd, '--', ...cmd], { stdio: [opts.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d)); child.stderr?.on('data', (d) => (stderr += d));
    const t = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 300_000);
    child.on('close', (code) => { clearTimeout(t); if (code !== 0) log.warn('runAs non-zero', { slug, code, stderr: stderr.slice(0, 300) }); resolvePromise({ code: code ?? -1, stdout, stderr }); });
    if (opts.stdin) { child.stdin!.write(opts.stdin); child.stdin!.end(); }
  });

/** Privileged provisioning (root helper). Returns the helper's JSON. */
export const provisionLinuxUser = async (uid: string, slug: string, email: string) => {
  const r = await new Promise<{ code: number; out: string; err: string }>((res) => {
    const c = spawn('sudo', ['-n', '/usr/local/sbin/atlas-provision', uid, slug, email], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = ''; c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => res({ code: code ?? -1, out, err }));
  });
  try { return JSON.parse(r.out.trim().split('\n').pop() ?? '{}') as { ok: boolean; error?: string; created?: boolean; linuxUser?: string; home?: string; projectsPath?: string; inboxPath?: string }; }
  catch { return { ok: false, error: `helper exit ${r.code}: ${(r.err || r.out).slice(0, 300)}` }; }
};

export const deprovisionLinuxUser = (slug: string, purge = false) =>
  new Promise<string>((res) => { const c = spawn('sudo', ['-n', '/usr/local/sbin/atlas-deprovision', slug, ...(purge ? ['--purge'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; c.stdout.on('data', (d) => (out += d)); c.on('close', () => res(out.trim())); });
