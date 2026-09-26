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

/** Streaming variant: invokes onLine for every stdout line (NDJSON from `claude --output-format stream-json`). */
export const runAsStream = (slug: string, cwd: string, cmd: string[], onLine: (line: string) => void | Promise<void>, opts: { timeoutMs?: number } = {}) =>
  new Promise<{ code: number; stderr: string }>((resolvePromise) => {
    const child = spawn('sudo', ['-n', '/usr/local/sbin/atlas-run', slug, cwd, '--', ...cmd], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = ''; let stderr = ''; let chain: Promise<void> = Promise.resolve();
    child.stdout?.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) chain = chain.then(() => onLine(line)).catch((e) => log.warn('stream handler error', { err: String(e).slice(0, 200) })); } });
    child.stderr?.on('data', (d) => (stderr += d));
    const t = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 20 * 60_000);
    child.on('close', async (code) => { clearTimeout(t); if (buf.trim()) { try { await onLine(buf); } catch { /* ignore */ } } await chain; resolvePromise({ code: code ?? -1, stderr }); });
  });
