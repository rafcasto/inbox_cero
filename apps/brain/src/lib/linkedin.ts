import { col, now } from './firestore';
import { open as unseal, seal } from './crypto';
import { getRedis } from './upstash';

export type LinkedInIntegration = { id: string; type: 'linkedin'; enabled: boolean; config: { personUrn: string; name: string; email?: string; expiresAt: string; refreshExpiresAt?: string; scopes: string[] }; secret: { v: 1; iv: string; tag: string; data: string } };
const VERSION = '202509';
const DAILY_BUDGET = Number(process.env.LINKEDIN_DAILY_CALLS ?? 100);

export const linkedinIntegration = async (uid: string): Promise<LinkedInIntegration | null> => {
  const s = await col(uid, 'integrations').where('type', '==', 'linkedin').limit(1).get();
  return s.empty ? null : ({ id: s.docs[0]!.id, ...(s.docs[0]!.data() as Omit<LinkedInIntegration, 'id'>) });
};

/** ~100 calls/day/member: count every API call; refuse when the budget is spent. */
export const budget = async (uid: string) => {
  const r = getRedis(); if (!r) return true;
  const key = `atlas:rl:linkedin:${uid}:${now().slice(0, 10)}`;
  const n = await r.incr(key); if (n === 1) await r.expire(key, 172800);
  if (n > DAILY_BUDGET) throw new Error(`LinkedIn daily call budget (${DAILY_BUDGET}) reached — try tomorrow`);
  return true;
};

export const tokens = (i: LinkedInIntegration) => JSON.parse(unseal(i.secret)) as { accessToken: string; refreshToken?: string };

/** Refresh when the access token is within `withinDays` of expiry. Returns whether a refresh happened. */
export const refreshIfNeeded = async (uid: string, i: LinkedInIntegration, withinDays = 10) => {
  const daysLeft = (new Date(i.config.expiresAt).getTime() - Date.now()) / 86400e3;
  if (daysLeft > withinDays) return { refreshed: false, daysLeft: Math.round(daysLeft) };
  const t = tokens(i);
  if (!t.refreshToken) return { refreshed: false, daysLeft: Math.round(daysLeft), note: 'no refresh token — reconnect LinkedIn' };
  const id = process.env.LINKEDIN_CLIENT_ID, secret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!id || !secret) throw new Error('LINKEDIN_CLIENT_ID/SECRET not set on the Pi');
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: id, client_secret: secret }) });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`LinkedIn refresh failed: ${j.error_description ?? j.error ?? r.status}`);
  await col(uid, 'integrations').doc(i.id).set({ secret: seal(JSON.stringify({ accessToken: j.access_token, refreshToken: j.refresh_token ?? t.refreshToken })), config: { ...i.config, expiresAt: new Date(Date.now() + (j.expires_in ?? 5184000) * 1000).toISOString(), refreshExpiresAt: j.refresh_token_expires_in ? new Date(Date.now() + j.refresh_token_expires_in * 1000).toISOString() : i.config.refreshExpiresAt }, lastRefreshAt: now() }, { merge: true });
  return { refreshed: true, daysLeft: Math.round((j.expires_in ?? 0) / 86400) };
};

const api = async (uid: string, i: LinkedInIntegration, method: string, path: string, body?: unknown) => {
  await budget(uid);
  const r = await fetch(`https://api.linkedin.com/rest/${path}`, { method, headers: { Authorization: `Bearer ${tokens(i).accessToken}`, 'LinkedIn-Version': VERSION, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j: any = {}; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text } }
  if (!r.ok) throw new Error(`LinkedIn ${method} ${path} → ${r.status}: ${j.message ?? j.raw ?? 'error'}`);
  return { j, headers: r.headers };
};

/** Publish a text post to the member's feed. Returns the post URN + URL. */
export const publishPost = async (uid: string, i: LinkedInIntegration, commentary: string) => {
  const { headers } = await api(uid, i, 'POST', 'posts', { author: i.config.personUrn, commentary, visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false });
  const urn = headers.get('x-restli-id') ?? '';
  return { urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : '' };
};

/** Community Management API (requires LinkedIn approval; behind LINKEDIN_ANALYTICS_ENABLED). */
export const postAnalytics = async (uid: string, i: LinkedInIntegration, postUrn: string) => {
  if (process.env.LINKEDIN_ANALYTICS_ENABLED !== '1') throw new Error('LinkedIn analytics is behind a feature flag (LINKEDIN_ANALYTICS_ENABLED=1) until the Community Management API is approved');
  const out: Record<string, number> = {};
  for (const metric of ['IMPRESSION', 'MEMBERS_REACHED', 'REACTION', 'COMMENT', 'RESHARE']) {
    const { j } = await api(uid, i, 'GET', `memberCreatorPostAnalytics?q=entity&entity=(post:${encodeURIComponent(postUrn)})&queryType=${metric}&aggregation=TOTAL`);
    out[metric] = Number(j.elements?.[0]?.count ?? j.elements?.[0]?.value ?? 0);
  }
  return { impressions: out.IMPRESSION ?? 0, reach: out.MEMBERS_REACHED ?? 0, reactions: out.REACTION ?? 0, comments: out.COMMENT ?? 0, reposts: out.RESHARE ?? 0 };
};
