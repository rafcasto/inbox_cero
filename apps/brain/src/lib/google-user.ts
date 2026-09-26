import { col } from './firestore';
import { open as unseal } from './crypto';

type GoogleIntegration = { id: string; config: { user: string; auth?: string; calendar?: boolean; scopes?: string[] }; secret: { v: 1; iv: string; tag: string; data: string }; enabled: boolean; provider?: string };
const cache = new Map<string, { token: string; exp: number }>();

/** Short-lived Google access token for a user's connected Gmail (refresh-token grant), cached ~50 min. */
export const userGoogleToken = async (integrationId: string, refreshToken: string) => {
  const hit = cache.get(integrationId); if (hit && hit.exp > Date.now()) return hit.token;
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID, secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET not set on the Pi');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`google token refresh failed: ${j.error_description ?? j.error ?? r.status}`);
  cache.set(integrationId, { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 600) * 1000 });
  return j.access_token;
};

/** All enabled Google (XOAUTH2) mailboxes for a user, with a token getter. */
export const googleAccounts = async (uid: string) => {
  const s = await col(uid, 'integrations').where('type', '==', 'imap').where('enabled', '==', true).get();
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GoogleIntegration, 'id'>) })).filter((i) => i.config.auth === 'xoauth2')
    .map((i) => ({ id: i.id, email: i.config.user, calendar: Boolean(i.config.calendar || i.config.scopes?.some((s) => s.includes('calendar'))), token: () => userGoogleToken(i.id, unseal(i.secret)) }));
};
