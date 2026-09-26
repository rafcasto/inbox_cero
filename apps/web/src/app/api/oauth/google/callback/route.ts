import { NextResponse } from 'next/server';
import { adminDb, nowIso, audit } from '@/lib/server/admin';
import { exchangeCode } from '@/lib/server/google-oauth';
import { seal } from '@/lib/server/crypto';
import { enqueueJob } from '@/lib/server/upstash';

/** Google redirects here. Stores the mailbox as an IMAP/XOAUTH2 integration and kicks off the first poll. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${u.origin}/settings?tab=integrations&${q}`);
  const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
  if (!code || !state) return back(`oauth=error&msg=${encodeURIComponent(u.searchParams.get('error') ?? 'missing code')}`);
  const db = adminDb();
  const st = await db.collection('oauthStates').doc(state).get();
  if (!st.exists || (st.data()!.expiresAt ?? '') < nowIso()) return back('oauth=error&msg=state%20expired');
  await st.ref.delete();
  const uid = st.data()!.uid as string;
  try {
    const { refreshToken, email, scope } = await exchangeCode(req, code);
    const col = db.collection('users').doc(uid).collection('integrations');
    const existing = await col.where('type', '==', 'imap').where('config.user', '==', email).limit(1).get();
    const ref = existing.empty ? col.doc() : existing.docs[0]!.ref;
    await ref.set({ type: 'imap', provider: 'gmail', label: email, enabled: true, config: { host: 'imap.gmail.com', port: 993, secure: true, user: email, auth: 'xoauth2', pollFolder: 'INBOX', filedFolder: 'Atlas/Filed', ignoredFolder: 'Atlas/Ignored', scopes: scope.split(' '), calendar: scope.includes('calendar'), drive: scope.includes('auth/drive') }, secret: seal(refreshToken), createdAt: nowIso(), lastError: null, cursor: existing.empty ? null : existing.docs[0]!.data().cursor ?? null }, { merge: true });
    await audit(uid, `connected Gmail ${email} via OAuth`, { target: { collection: 'integrations', id: ref.id } });
    await enqueueJob({ userId: uid, type: 'email.poll', payload: { integrationId: ref.id } }).catch(() => {});
    return back(`oauth=ok&email=${encodeURIComponent(email)}`);
  } catch (e) {
    return back(`oauth=error&msg=${encodeURIComponent((e as Error).message)}`);
  }
}
