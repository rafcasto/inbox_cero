import { Job } from '@atlas/schemas';
import { config } from './config';
import { log } from './lib/log';
import { ensureGroup, readJobs, ack, deadLetter, heartbeat, enqueue, setResult } from './lib/upstash';
import { loadContext } from './lib/context';
import { handlers } from './tasks';
import { activeUserIds } from './lib/firestore';

const MAX_ATTEMPTS = 3;

export const runJob = async (job: Job) => {
  const h = handlers[job.type];
  if (!h) throw new Error(`no handler for ${job.type}`);
  const ctx = await loadContext(job.userId);
  return h(ctx, { ...job.payload, model: job.model });
};

/** Fan-out helper: n8n can enqueue {userId:"*"} to run a job for every active user. */
const expand = async (job: Job): Promise<Job[]> => (job.userId === '*' ? (await activeUserIds()).map((uid) => ({ ...job, userId: uid, idempotencyKey: `${job.idempotencyKey}:${uid}` })) : [job]);

export const startWorker = () => {
  if (!config.upstashUrl) { log.warn('Upstash not configured; worker disabled'); return; }
  let stopped = false;
  const loop = async () => {
    await ensureGroup();
    while (!stopped) {
      try {
        await heartbeat();
        const entries = await readJobs(20);
        for (const e of entries) {
          try {
            for (const j of await expand(e.job)) {
              const t0 = Date.now();
              const { __resultKey, ...payload } = j.payload as Record<string, unknown>;
              const out = await runJob({ ...j, payload });
              log.info('job ok', { type: j.type, uid: j.userId, ms: Date.now() - t0, out: JSON.stringify(out).slice(0, 200) });
              if (typeof __resultKey === 'string') await setResult(__resultKey, { output: out });
            }
            await ack(e.id);
          } catch (err) {
            const attempts = (e.job.attempts ?? 0) + 1;
            const resultKey = (e.job.payload as Record<string, unknown>).__resultKey;
            log.error('job failed', { type: e.job.type, uid: e.job.userId, attempts, err: String(err).slice(0, 400) });
            if (typeof resultKey === 'string') { await setResult(resultKey, { error: String(err).slice(0, 400) }); await ack(e.id); }
            else if (attempts >= MAX_ATTEMPTS) await deadLetter(e, String(err));
            else { await ack(e.id); await enqueue({ ...e.job, attempts }); }
          }
        }
        if (!entries.length) await new Promise((r) => setTimeout(r, config.pollMs));
      } catch (err) {
        log.error('worker loop error', { err: String(err).slice(0, 300) });
        await new Promise((r) => setTimeout(r, config.pollMs * 2));
      }
    }
  };
  loop();
  return () => { stopped = true; };
};

if (process.argv[1]?.endsWith('worker.ts')) startWorker();
