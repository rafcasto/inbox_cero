import { Redis } from '@upstash/redis';
import { Job } from '@atlas/schemas';
import { config } from '../config';
import { log } from './log';

export const STREAM = 'atlas:jobs';
export const DLQ = 'atlas:jobs:dlq';
export const GROUP = 'pi';
export const CONSUMER = `brain-${process.pid}`;

let redis: Redis | null = null;
export const getRedis = () => {
  if (!config.upstashUrl || !config.upstashToken) return null;
  if (!redis) redis = new Redis({ url: config.upstashUrl, token: config.upstashToken });
  return redis;
};

export const ensureGroup = async () => {
  const r = getRedis();
  if (!r) return;
  try {
    await r.xgroup(STREAM, { type: 'CREATE', group: GROUP, id: '0', options: { MKSTREAM: true } });
  } catch (e) {
    if (!String(e).includes('BUSYGROUP')) throw e;
  }
};

export const enqueue = async (job: Job) => {
  const r = getRedis();
  if (!r) throw new Error('Upstash not configured');
  return r.xadd(STREAM, '*', { job: JSON.stringify(job) });
};

export type StreamEntry = { id: string; job: Job };

/** Read up to `count` new (or pending-for-this-consumer) jobs. */
export const readJobs = async (count = 20): Promise<StreamEntry[]> => {
  const r = getRedis();
  if (!r) return [];
  const res = (await r.xreadgroup(GROUP, CONSUMER, STREAM, '>', { count })) as unknown as Array<[string, Array<[string, string[]]>]> | null;
  if (!res) return [];
  const out: StreamEntry[] = [];
  for (const [, entries] of res) {
    for (const [id, fields] of entries) {
      const raw = Array.isArray(fields) ? fields[fields.indexOf('job') + 1] : (fields as any).job;
      try {
        out.push({ id, job: Job.parse(JSON.parse(String(raw))) });
      } catch (e) {
        log.error('bad job on stream, acking', { id, err: String(e) });
        await r.xack(STREAM, GROUP, id);
      }
    }
  }
  return out;
};

export const ack = async (id: string) => getRedis()?.xack(STREAM, GROUP, id);

export const deadLetter = async (entry: StreamEntry, err: string) => {
  const r = getRedis();
  if (!r) return;
  await r.xadd(DLQ, '*', { job: JSON.stringify(entry.job), err: err.slice(0, 500), at: new Date().toISOString() });
  await r.xack(STREAM, GROUP, entry.id);
};

/** Interactive results for the portal's /api/brain relay. */
export const setResult = async (key: string, value: unknown) => getRedis()?.set(`atlas:result:${key}`, JSON.stringify(value), { ex: 300 });

export const heartbeat = async () => getRedis()?.set('atlas:heartbeat:pi', new Date().toISOString(), { ex: 90 });

export const cacheGet = async (k: string) => (await getRedis()?.get<string>(`atlas:cache:${k}`)) ?? null;
export const cacheSet = async (k: string, v: unknown, ttlSec = 86400) => getRedis()?.set(`atlas:cache:${k}`, JSON.stringify(v), { ex: ttlSec });

export const rateLimitOk = async (uid: string, budget: number) => {
  const r = getRedis();
  if (!r) return true;
  const key = `atlas:rl:${uid}:${new Date().toISOString().slice(0, 10)}`;
  const n = await r.incr(key);
  if (n === 1) await r.expire(key, 86400 * 2);
  return n <= budget;
};
