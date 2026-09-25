import Fastify from 'fastify';
import { BrainRunRequest, Job } from '@atlas/schemas';
import { config } from './config';
import { log } from './lib/log';
import { loadPrompts } from './lib/prompts';
import { loadContext } from './lib/context';
import { runTask } from './lib/runner';
import { handlers } from './tasks';
import { startWorker, runJob } from './worker';
import { enqueue, getRedis } from './lib/upstash';
import { z } from 'zod';

const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });

app.addHook('onRequest', async (req, reply) => {
  if (req.url === '/health') return;
  if (!config.token) return; // dev mode
  if (req.headers.authorization !== `Bearer ${config.token}`) return reply.code(401).send({ ok: false, error: 'unauthorized' });
});

app.get('/health', async () => ({ ok: true, prompts: [...loadPrompts().keys()], upstash: Boolean(getRedis()), model: config.defaultModel, dryRun: config.dryRun }));

/** Generic: run any registered task handler synchronously. */
app.post('/run', async (req, reply) => {
  const parsed = BrainRunRequest.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
  const { userId, task, input, model } = parsed.data;
  const t0 = Date.now();
  try {
    if (handlers[task]) {
      const out = await runJob({ userId, type: task as Job['type'], payload: input, enqueuedAt: new Date().toISOString(), idempotencyKey: parsed.data.idempotencyKey ?? `${task}:${Date.now()}`, attempts: 0, model });
      return { ok: true, task, output: out, usage: { durationMs: Date.now() - t0 } };
    }
    // Raw prompt task (any prompts/*.md task name) with free-form JSON output
    const ctx = await loadContext(userId);
    const r = await runTask({ ctx, task, vars: input, schema: z.any(), model });
    return { ok: true, task, model: r.model, output: r.output, cached: r.cached, usage: { costUsd: r.costUsd, durationMs: Date.now() - t0 } };
  } catch (e) {
    log.error('run failed', { task, userId, err: String(e).slice(0, 400) });
    return reply.code(500).send({ ok: false, task, error: String(e).slice(0, 400) });
  }
});

/** Enqueue a job on the Upstash stream (used by n8n schedules). userId "*" fans out to all active users. */
app.post('/jobs', async (req, reply) => {
  const parsed = Job.safeParse({ enqueuedAt: new Date().toISOString(), idempotencyKey: `${Date.now()}`, ...(req.body as object) });
  if (!parsed.success) return reply.code(400).send({ ok: false, error: parsed.error.message });
  const id = await enqueue(parsed.data);
  return { ok: true, id };
});

app.post('/prompts/reload', async () => ({ ok: true, prompts: [...loadPrompts().keys()] }));

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  log.info('atlas-brain listening', { port: config.port, model: config.defaultModel, upstash: Boolean(getRedis()) });
  startWorker();
});
