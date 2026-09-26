import { NextResponse } from 'next/server';
import { handle, requireUser, adminDb, nowIso, HttpError } from '@/lib/server/admin';
import { authUrl, oauthConfigured } from '@/lib/server/google-oauth';
import { randomBytes } from 'node:crypto';

/** Returns the Google consent URL for the signed-in user. State is a one-time nonce stored server-side. */
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  if (!oauthConfigured()) throw new HttpError(501, 'Google OAuth is not configured (GOOGLE_OAUTH_CLIENT_ID / _SECRET)');
  const state = randomBytes(16).toString('hex');
  await adminDb().collection('oauthStates').doc(state).set({ uid, provider: 'google', createdAt: nowIso(), expiresAt: new Date(Date.now() + 10 * 60e3).toISOString() });
  return NextResponse.json({ ok: true, url: authUrl(req, state) });
});
