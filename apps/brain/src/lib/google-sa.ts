import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { config } from '../config';

type SA = { client_email: string; private_key: string; token_uri?: string };
let sa: SA | null = null;
export const serviceAccount = (): SA => {
  if (sa) return sa;
  const raw = config.serviceAccountJson || (config.serviceAccountFile ? readFileSync(config.serviceAccountFile, 'utf8') : Buffer.from(config.serviceAccountB64 ?? '', 'base64').toString('utf8'));
  sa = JSON.parse(raw); return sa!;
};

const cache = new Map<string, { token: string; exp: number }>();
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Service-account access token for arbitrary Google scopes (JWT bearer grant). Cached ~55 min. */
export const saAccessToken = async (scopes: string[]): Promise<string> => {
  const key = scopes.join(' ');
  const hit = cache.get(key); if (hit && hit.exp > Date.now()) return hit.token;
  const s = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: s.client_email, scope: key, aud: s.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const signer = createSign('RSA-SHA256'); signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(s.private_key))}`;
  const r = await fetch(s.token_uri ?? 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`SA token failed: ${j.error_description ?? j.error ?? r.status}`);
  cache.set(key, { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 3600) - 300) * 1000 });
  return j.access_token;
};

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
