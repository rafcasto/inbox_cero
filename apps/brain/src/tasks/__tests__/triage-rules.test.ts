import { describe, it, expect } from 'vitest';
import { Profile } from '@atlas/schemas';
import { applyRules } from '../triage';

const profile = Profile.parse({ noise: { neverSurface: ['promo@'], alwaysSurface: ['accountant'] }, priorityRules: [{ id: 'r1', match: { fromDomain: 'client.io' }, effect: { action: 'surface', priority: 'P0' }, note: 'key client' }, { id: 'r2', match: { subjectContains: 'weekly digest' }, effect: { action: 'ignore' }, note: '' }] });
const item = (o: Partial<{ from: string; subject: string; hasListUnsubscribe: boolean }>) => ({ id: 'x', from: 'a@b.com', to: '', subject: '', receivedAt: new Date().toISOString(), snippet: '', hasListUnsubscribe: false, source: 'email' as const, ...o });

describe('deterministic triage rules', () => {
  it('never-surface list → ignored without AI', () => { expect(applyRules(profile, item({ from: 'promo@shop.com', subject: 'Deals' }))?.triage.action).toBe('ignore'); });
  it('always-surface wins over noise', () => { expect(applyRules(profile, item({ from: 'jane@accountant.co.nz', subject: '50% off', hasListUnsubscribe: true }))).toBeNull(); });
  it('receipts auto-file and route to finance', () => { const r = applyRules(profile, item({ from: 'billing@vercel.com', subject: 'Your receipt from Vercel' })); expect(r?.triage.action).toBe('file'); expect(r?.triage.isReceipt).toBe(true); });
  it('bulk marketing with List-Unsubscribe → ignored', () => { expect(applyRules(profile, item({ from: 'news@brand.com', subject: 'Last chance: sale ends tonight', hasListUnsubscribe: true }))?.ruleId).toBe('bulk-marketing'); });
  it('surface rules defer to the brain (never auto-ignore)', () => { expect(applyRules(profile, item({ from: 'sam@client.io', subject: 'Deals' }))).toBeNull(); });
  it('explicit ignore rule by subject', () => { expect(applyRules(profile, item({ subject: 'Your weekly digest' }))?.ruleId).toBe('r2'); });
  it('ordinary human mail goes to the brain', () => { expect(applyRules(profile, item({ from: 'someone@gmail.com', subject: 'Coffee next week?' }))).toBeNull(); });
});
