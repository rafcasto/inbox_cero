import { spawn } from 'node:child_process';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { config } from '../config';
import { log } from './log';

export type ClaudeUsage = { tokensIn: number; tokensOut: number; costUsd: number; durationMs: number; model: string };

const SYSTEM = 'You are a precise assistant embedded in a personal Chief of Staff system. Respond only with JSON matching the requested schema. No prose, no markdown fences.';

const stripFences = (s: string) => s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

const runOnce = (prompt: string, model: string, jsonSchema?: object): Promise<{ text: string; structured?: unknown; usage: ClaudeUsage }> =>
  new Promise((resolvePromise, reject) => {
    const args = [
      '-p', prompt,
      '--model', model,
      '--output-format', 'json',
      '--max-turns', '1',
      '--tools', '',
      '--strict-mcp-config',
      '--setting-sources', '',
      '--no-session-persistence',
      '--system-prompt', SYSTEM,
      '--max-budget-usd', String(config.maxBudgetUsd),
    ];
    // Only constrain output when the schema is a real object schema; `{}` (z.any) is rejected by the API.
    if (jsonSchema && typeof jsonSchema === 'object' && 'type' in (jsonSchema as Record<string, unknown>)) args.push('--json-schema', JSON.stringify(jsonSchema));
    const t0 = Date.now();
    const child = spawn(config.claudeBin, args, { env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('claude timeout after 180s')); }, 180_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const friendly = (msg: string) => /not logged in|\/login|invalid api key|authentication/i.test(msg)
        ? `Claude CLI is not authenticated for the Pi service user (${msg.trim()}). Fix on the Pi: run \`claude setup-token\` and put the token in /etc/atlas/env as CLAUDE_CODE_OAUTH_TOKEN, then \`sudo systemctl restart atlas-brain\`.`
        : msg;
      let parsed: any = null;
      try { parsed = JSON.parse(out); } catch { /* not JSON */ }
      if (code !== 0) return reject(new Error(friendly(parsed?.result ? String(parsed.result).slice(0, 300) : `claude exited ${code}: ${(err || out).slice(0, 300)}`)));
      try {
        const j = parsed ?? JSON.parse(out);
        if (j.is_error) return reject(new Error(friendly(String(j.result).slice(0, 300))));
        const u = j.usage ?? {};
        const usage: ClaudeUsage = {
          tokensIn: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
          tokensOut: u.output_tokens ?? 0,
          costUsd: Number(j.total_cost_usd ?? 0),
          durationMs: Date.now() - t0,
          model: Object.keys(j.modelUsage ?? {})[0] ?? model,
        };
        resolvePromise({ text: String(j.result ?? ''), structured: j.structured_output, usage });
      } catch (e) {
        reject(new Error(`claude produced non-JSON output: ${out.slice(0, 300)}`));
      }
    });
  });

/** Run a prompt through the Claude Code CLI and validate the output against a Zod schema. Retries once on validation failure. */
export const runClaude = async <S extends ZodTypeAny>(opts: { prompt: string; model: string; schema: S; task: string }): Promise<{ output: z.infer<S>; usage: ClaudeUsage }> => {
  const jsonSchema = zodToJsonSchema(opts.schema, { $refStrategy: 'none' });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await runOnce(attempt === 1 ? opts.prompt : `${opts.prompt}\n\nYour previous answer was not valid JSON for the schema (${String(lastErr).slice(0, 200)}). Return ONLY valid JSON.`, opts.model, jsonSchema);
    const candidate = r.structured ?? (() => { try { return JSON.parse(stripFences(r.text)); } catch { return undefined; } })();
    const parsed = opts.schema.safeParse(candidate);
    if (parsed.success) return { output: parsed.data, usage: r.usage };
    lastErr = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    log.warn('claude output failed validation', { task: opts.task, attempt, err: String(lastErr).slice(0, 300) });
  }
  throw new Error(`claude output invalid after retry: ${String(lastErr)}`);
};
