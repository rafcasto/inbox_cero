import { NextResponse } from 'next/server';
import { handle, requireUser, adminDb, nowIso, HttpError } from '@/lib/server/admin';
import { authUrl, linkedinConfigured } from '@/lib/server/linkedin-oauth';
import { randomBytes } from 'node:crypto';
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  if (!linkedinConfigured()) throw new HttpError(501, 'LinkedIn is not configured (LINKEDIN_CLIENT_ID / _SECRET)');
  const state = randomBytes(16).toString('hex');
  await adminDb().collection('oauthStates').doc(state).set({ uid, provider: 'linkedin', createdAt: nowIso(), expiresAt: new Date(Date.now() + 10 * 60e3).toISOString() });
  return NextResponse.json({ ok: true, url: authUrl(req, state) });
});
