import 'server-only';
export const LINKEDIN_SCOPES = ['openid', 'profile', 'email', 'w_member_social', ...(process.env.LINKEDIN_ANALYTICS_ENABLED === '1' ? ['r_member_postAnalytics'] : [])];
export const linkedinConfigured = () => Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET);
export const redirectUri = (req: Request) => { const u = new URL(req.url); const base = process.env.NEXT_PUBLIC_APP_URL || `${u.protocol}//${u.host}`; return `${base.replace(/\/$/, '')}/api/oauth/linkedin/callback`; };
export const authUrl = (req: Request, state: string) => `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: process.env.LINKEDIN_CLIENT_ID!, redirect_uri: redirectUri(req), state, scope: LINKEDIN_SCOPES.join(' ') })}`;
export const exchangeCode = async (req: Request, code: string) => {
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET!, redirect_uri: redirectUri(req) }) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`LinkedIn token exchange failed: ${j.error_description ?? j.error ?? r.status}`);
  const me = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json());
  return { accessToken: j.access_token as string, refreshToken: j.refresh_token as string | undefined, expiresIn: Number(j.expires_in ?? 5184000), refreshExpiresIn: j.refresh_token_expires_in ? Number(j.refresh_token_expires_in) : undefined, scope: String(j.scope ?? LINKEDIN_SCOPES.join(' ')), personUrn: `urn:li:person:${me.sub}`, name: String(me.name ?? ''), email: String(me.email ?? '') };
};
