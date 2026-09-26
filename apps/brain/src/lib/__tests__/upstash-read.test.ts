import { describe, it, expect, vi } from 'vitest';
const job = { userId: 'u', type: 'mail.ask', payload: { question: 'x' }, enqueuedAt: '2026-01-01T00:00:00Z', idempotencyKey: 'k', attempts: 0 };
const mk = (res: unknown) => ({ xreadgroup: vi.fn(async () => res), xack: vi.fn(async () => 1), xgroup: vi.fn() });
describe('readJobs tolerates SDK shapes', () => {
  it('object fields with pre-parsed JSON (Upstash SDK default)', async () => {
    vi.doMock('@upstash/redis', () => ({ Redis: vi.fn(() => mk([['atlas:jobs', [['1-0', { job }]]]])) }));
    vi.doMock('../../config', () => ({ config: { upstashUrl: 'https://x', upstashToken: 't', pollMs: 1 } }));
    const { readJobs } = await import('../upstash');
    const r = await readJobs(); expect(r[0]!.job.type).toBe('mail.ask'); vi.resetModules();
  });
  it('array fields with a JSON string', async () => {
    vi.doMock('@upstash/redis', () => ({ Redis: vi.fn(() => mk([['atlas:jobs', [['2-0', ['job', JSON.stringify(job)]]]]])) }));
    vi.doMock('../../config', () => ({ config: { upstashUrl: 'https://x', upstashToken: 't', pollMs: 1 } }));
    const { readJobs } = await import('../upstash');
    const r = await readJobs(); expect(r[0]!.id).toBe('2-0'); vi.resetModules();
  });
});
