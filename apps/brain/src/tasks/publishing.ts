import '../publishers/linkedin';
import '../publishers/kit';
import { publishers } from '../publishers/index';
import { col, now, listDocs } from '../lib/firestore';
import { event } from '../lib/events';
import { park } from '../lib/governance';
import { linkedinIntegration, refreshIfNeeded, postAnalytics } from '../lib/linkedin';
import type { UserContext } from '../lib/context';

/** Publish/draft a content piece to a channel. Only reachable from a human click (portal → /api/jobs). */
const publishTo = async (ctx: UserContext, channel: string, contentId: string) => {
  const ref = col(ctx.uid, 'content').doc(contentId);
  const c = (await ref.get()).data(); if (!c) throw new Error('content not found');
  const pub = publishers[channel]; if (!pub) throw new Error(`no publisher for ${channel}`);
  const res = await pub.publish(ctx, { id: contentId, title: c.title ?? '', body: c.body ?? '', platform: c.platform });
  const versions = [...(c.versions ?? []), { at: now(), stage: res.status === 'published' ? 'published' : c.stage, title: c.title ?? '', body: c.body ?? '', note: `${res.status} → ${channel}` }].slice(-20);
  await ref.set({ publishedTo: [...(c.publishedTo ?? []), { ...res, at: now() }], versions, ...(res.status === 'published' ? { stage: 'published', publishedAt: now(), publishedUrl: res.url ?? c.publishedUrl ?? null } : {}), updatedAt: now() }, { merge: true });
  await event(ctx.uid, { actionType: 'content', action: `${res.status === 'published' ? 'published' : 'drafted'} "${(c.title ?? c.body ?? '').slice(0, 50)}" → ${channel}`, projectId: c.projectId ?? null, ref: contentId, approval: 'user', reason: res.url });
  return res;
};
export const linkedinPublish = (ctx: UserContext, p: { contentId: string }) => publishTo(ctx, 'linkedin', p.contentId);
export const newsletterPublish = (ctx: UserContext, p: { contentId: string; channel?: string }) => publishTo(ctx, p.channel ?? 'kit', p.contentId);

/** Daily: refresh LinkedIn access tokens at ~day 50 of 60; warn when the refresh token (365 d) is within 25 days of expiry. */
export const linkedinRefresh = async (ctx: UserContext) => {
  const i = await linkedinIntegration(ctx.uid); if (!i) return { skipped: 'not connected' };
  const r = await refreshIfNeeded(ctx.uid, i, 10);
  if (i.config.refreshExpiresAt && (new Date(i.config.refreshExpiresAt).getTime() - Date.now()) / 86400e3 < 25) {
    await park(ctx, { kind: 'clarify', question: `Your LinkedIn connection expires on ${i.config.refreshExpiresAt.slice(0, 10)} (LinkedIn caps refresh tokens at one year). Reconnect in Settings → Integrations when convenient.`, options: [{ key: '1', label: 'OK' }], context: {}, dedupe: `li-refresh-${i.config.refreshExpiresAt.slice(0, 7)}` });
  }
  return r;
};

/** Pull post analytics for published LinkedIn pieces (feature-flagged). */
export const linkedinAnalytics = async (ctx: UserContext) => {
  if (process.env.LINKEDIN_ANALYTICS_ENABLED !== '1') return { skipped: 'LINKEDIN_ANALYTICS_ENABLED not set (awaiting Community Management API approval)' };
  const i = await linkedinIntegration(ctx.uid); if (!i) return { skipped: 'not connected' };
  const pieces = (await listDocs(ctx.uid, 'content', (q) => q.where('stage', '==', 'published'))).filter((c: any) => (c.publishedTo ?? []).some((p: any) => p.channel === 'linkedin')) as any[];
  let n = 0;
  for (const c of pieces.slice(0, 30)) {
    const urn = c.publishedTo.find((p: any) => p.channel === 'linkedin').id; if (!urn) continue;
    try {
      const m = await postAnalytics(ctx.uid, i, urn);
      await col(ctx.uid, 'contentMetrics').doc(`li-${urn.replace(/[^a-zA-Z0-9]/g, '')}-${now().slice(0, 10)}`).set({ platform: 'linkedin', date: now().slice(0, 10), contentId: c.id, postUrn: urn, source: 'api', ...m });
      await col(ctx.uid, 'content').doc(c.id).set({ metrics: { impressions: m.impressions, likes: m.reactions, comments: m.comments, shares: m.reposts }, metricsAt: now() }, { merge: true });
      n++;
    } catch (e) { await event(ctx.uid, { actionType: 'content', action: `LinkedIn analytics failed for ${c.title}`, reason: String(e).slice(0, 160) }); }
  }
  return { updated: n };
};
