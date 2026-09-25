import 'server-only';
import { Redis } from '@upstash/redis';
import { Job } from '@atlas/schemas';

let r: Redis | null = null;
export const redis = () => { if (!process.env.UPSTASH_REDIS_REST_URL) return null; return (r ??= new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! })); };

export const enqueueJob = async (job: Omit<Job, 'enqueuedAt' | 'idempotencyKey' | 'attempts'> & { idempotencyKey?: string }) => {
  const client = redis();
  if (!client) throw new Error('Upstash not configured');
  const full = Job.parse({ enqueuedAt: new Date().toISOString(), idempotencyKey: job.idempotencyKey ?? `${job.type}:${job.userId}:${Date.now()}`, attempts: 0, ...job });
  return client.xadd('atlas:jobs', '*', { job: JSON.stringify(full) });
};

export const piHealth = async () => {
  const client = redis();
  if (!client) return { heartbeat: null, dlq: 0, pending: 0 };
  const [heartbeat, dlq, pending] = await Promise.all([client.get<string>('atlas:heartbeat:pi'), client.xlen('atlas:jobs:dlq'), client.xlen('atlas:jobs')]);
  return { heartbeat, dlq, pending };
};
