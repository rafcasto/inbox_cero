import { Automation, type AutomationType } from '@atlas/schemas';
import { col, now, listDocs, userRef } from '../lib/firestore';
import { localNow, type UserContext } from '../lib/context';
import { event } from '../lib/events';
import { handlers } from './index';

export const DEFAULT_AUTOMATIONS: Array<Omit<Automation, 'id'>> = [
  { type: 'daily.digest', name: 'Daily digest', enabled: true, time: '07:00', days: [], channels: ['inbox', 'email', 'whatsapp'], config: { maxThreads: 50, maxBodies: 5 } },
  { type: 'drive.sync', name: 'Drive sync (pull + push)', enabled: true, time: '*', days: [], channels: [], config: {} },
  { type: 'weekly.finance', name: 'Weekly finance summary', enabled: false, time: '17:00', days: [5], channels: ['whatsapp'], config: {} },
  { type: 'content.ideas', name: 'Content ideas from the week', enabled: false, time: '16:00', days: [5], channels: ['inbox'], config: { platforms: ['linkedin'] } },
  { type: 'linkedin.refresh', name: 'LinkedIn token refresh', enabled: true, time: '03:00', days: [], channels: [], config: {} },
  { type: 'linkedin.analytics', name: 'LinkedIn post analytics', enabled: true, time: '06:00', days: [], channels: [], config: {} },
];

/** Ensure the user has the default automation docs (idempotent, keyed by type). */
export const ensureAutomations = async (uid: string) => {
  const existing = new Set((await listDocs(uid, 'automations')).map((a: any) => a.type));
  for (const a of DEFAULT_AUTOMATIONS) if (!existing.has(a.type)) await col(uid, 'automations').doc(a.type).set(a);
};

/** Map an automation type to the job that implements it. */
const JOB_FOR: Record<AutomationType, { type: string; payload: (a: Automation) => Record<string, unknown> }> = {
  'daily.digest': { type: 'digest.compose', payload: (a) => ({ channels: a.channels, ...a.config }) },
  'weekly.finance': { type: 'finance.monthly', payload: () => ({}) },
  'weekly.truth': { type: 'session.start', payload: () => ({ type: 'weekly', force: true }) },
  'daily.checkin': { type: 'session.start', payload: () => ({ type: 'daily', force: true }) },
  'content.ideas': { type: 'content.draft', payload: (a) => ({ platforms: a.config.platforms ?? ['linkedin'], seeds: [{ type: 'manual', text: 'Ideas from this week: look at recent content seeds and mail summaries' }] }) },
  'kr.nudge': { type: 'kr.autoupdate', payload: () => ({}) },
  'drive.sync': { type: 'drive.pull', payload: () => ({}) },
  'custom.prompt': { type: 'project.run', payload: (a) => ({ projectId: a.config.projectId, prompt: a.config.prompt, fresh: true }) },
  'linkedin.refresh': { type: 'linkedin.refresh', payload: () => ({}) },
  'linkedin.analytics': { type: 'linkedin.analytics', payload: () => ({}) },
};

/**
 * automations.tick — n8n fires this hourly for all users; each user's automations run when it's their local hour
 * (and weekday). `time: "*"` = every tick. Runs sequentially per user; results recorded on the automation doc.
 */
export const automationsTick = async (ctx: UserContext, payload: { force?: string }) => {
  await ensureAutomations(ctx.uid);
  const { hour, day } = localNow(ctx);
  const list = (await listDocs(ctx.uid, 'automations')).map((a: any) => Automation.parse(a));
  const ran: string[] = [];
  for (const a of list) {
    const due = payload.force === a.id || payload.force === a.type || (a.enabled && (a.time === '*' || Number(a.time.split(':')[0]) === hour) && (a.days.length === 0 || a.days.includes(day)) && (a.time === '*' || !(a.lastRunAt && a.lastRunAt.slice(0, 13) === now().slice(0, 13))));
    if (!due) continue;
    const job = JOB_FOR[a.type]; if (!job || !handlers[job.type]) continue;
    const t0 = Date.now();
    try {
      const out = await handlers[job.type]!(ctx, job.payload(a));
      await col(ctx.uid, 'automations').doc(a.id).set({ lastRunAt: now(), lastStatus: 'ok', lastResult: JSON.stringify(out).slice(0, 300) }, { merge: true });
      if (a.type !== 'drive.sync') await event(ctx.uid, { actionType: 'job.run', action: `automation: ${a.name}`, ref: a.id, reason: JSON.stringify(out).slice(0, 160), meta: { ms: Date.now() - t0 } });
      if (a.type === 'drive.sync' && handlers['drive.push']) await handlers['drive.push']!(ctx, {});
      ran.push(a.id);
    } catch (e) {
      await col(ctx.uid, 'automations').doc(a.id).set({ lastRunAt: now(), lastStatus: 'error', lastResult: String(e).slice(0, 300) }, { merge: true });
      await event(ctx.uid, { actionType: 'job.run', action: `automation failed: ${a.name}`, ref: a.id, reason: String(e).slice(0, 200) });
    }
  }
  return { ran, hour, day };
};
