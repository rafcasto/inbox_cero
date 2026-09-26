import { describe, it, expect, vi } from 'vitest';
import { Profile } from '@atlas/schemas';

vi.mock('../runner', () => ({ runTask: vi.fn(async () => ({ output: { verdicts: [{ id: 'rv', verdict: 'unsure', reason: 'ambiguous sender' }] }, model: 'mock', promptVersion: '1', cached: false, costUsd: 0 })) }));
vi.mock('../firestore', () => ({ col: vi.fn(), now: () => new Date().toISOString(), listDocs: vi.fn(async () => []), audit: vi.fn(async () => {}) }));
vi.mock('../whatsapp', () => ({ sendText: vi.fn(async () => ({})) }));

const { decide, isFloor } = await import('../governance');

const ctx = (governance: Record<string, unknown>) => ({ uid: 'u', name: 'R', timezone: 'Pacific/Auckland', projects: [], areas: [], profile: Profile.parse({ governance }) }) as any;
const proposal = (o: Partial<{ id: string; action: string; confidence: number; type: string; fromDomain: string }> = {}) => ({ id: o.id ?? 'p1', action: o.action ?? 'mail.autoIgnore', summary: 'x', features: { fromDomain: o.fromDomain ?? 'shop.com', fromEmail: 'a@' + (o.fromDomain ?? 'shop.com') }, confidence: o.confidence ?? 0.95, reason: 'r', pending: { type: o.type ?? 'email.act', payload: {} } });

describe('governance ladder', () => {
  it('hard floors are refused in every mode', async () => {
    expect(isFloor('email.send')).toBe(true);
    const [d] = await decide(ctx({ mode: 'auto' }), [proposal({ type: 'email.send' })]);
    expect(d!.allow).toBe(false); expect(d!.approval).toBe('floor');
  });
  it('write_local and owner egress are never gated', async () => {
    const ds = await decide(ctx({ mode: 'ask' }), [proposal({ action: 'task.create' }), proposal({ id: 'p2', action: 'whatsapp.sendOwner' })]);
    expect(ds.every((d) => d.allow && d.approval === 'auto')).toBe(true);
  });
  it('paused autonomy blocks external actions', async () => {
    const [d] = await decide(ctx({ mode: 'auto', paused: true, pausedReason: 'breaker' }), [proposal()]);
    expect(d!.allow).toBe(false); expect(d!.approval).toBe('paused');
  });
  it('standing rules allow without the reviewer', async () => {
    const [d] = await decide(ctx({ mode: 'ask', allow: [{ id: 'r1', action: 'mail.autoIgnore', match: { fromDomain: 'shop.com' }, note: 'promos' }] }), [proposal()]);
    expect(d!.allow).toBe(true); expect(d!.approval).toBe('rule');
  });
  it('ask mode denies everything external without a rule', async () => {
    const [d] = await decide(ctx({ mode: 'ask' }), [proposal()]);
    expect(d!.allow).toBe(false); expect(d!.approval).toBe('denied');
  });
  it('auto mode allows above threshold, reviews below', async () => {
    const [hi, lo] = await decide(ctx({ mode: 'auto', reviewThreshold: 0.9 }), [proposal({ id: 'hi', confidence: 0.95 }), proposal({ id: 'rv', confidence: 0.6 })]);
    expect(hi!.approval).toBe('auto'); expect(lo!.allow).toBe(false); expect(lo!.reason).toContain('unsure');
  });
  it('reviewed-auto always consults the reviewer; unsure parks', async () => {
    const [d] = await decide(ctx({ mode: 'reviewed-auto' }), [proposal({ id: 'rv', confidence: 0.99 })]);
    expect(d!.allow).toBe(false); expect(d!.approval).toBe('denied');
  });
});
