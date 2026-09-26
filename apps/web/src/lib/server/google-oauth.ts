import 'server-only';
export const GOOGLE_SCOPES = ['https://mail.google.com/', 'openid', 'email'];
export const oauthConfigured = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
export const redirectUri = (req: Request) => { const u = new URL(req.url); const base = process.env.NEXT_PUBLIC_APP_URL || `${u.protocol}//${u.host}`; return `${base.replace(/\/$/, '')}/api/oauth/google/callback`; };
export const authUrl = (req: Request, state: string) => {
  const p = new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, redirect_uri: redirectUri(req), response_type: 'code', scope: GOOGLE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent select_account', include_granted_scopes: 'true', state });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
};
export const exchangeCode = async (req: Request, code: string) => {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }) });
  const j = await r.json();
  if (!r.ok || !j.refresh_token) throw new Error(`token exchange failed: ${j.error_description ?? j.error ?? r.status}${j.refresh_token ? '' : ' (no refresh_token — remove Atlas at myaccount.google.com/permissions and reconnect)'}`);
  const info = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json());
  return { refreshToken: j.refresh_token as string, email: String(info.email ?? ''), scope: String(j.scope ?? '') };
};
