import { NextResponse } from 'next/server';
import { adminDb, nowIso, audit } from '@/lib/server/admin';
import { exchangeCode } from '@/lib/server/linkedin-oauth';
import { seal } from '@/lib/server/crypto';
export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${u.origin}/settings?tab=integrations&${q}`);
  const code = u.searchParams.get('code'); const state = u.searchParams.get('state');
  if (!code || !state) return back(`linkedin=error&msg=${encodeURIComponent(u.searchParams.get('error_description') ?? u.searchParams.get('error') ?? 'missing code')}`);
  const db = adminDb(); const st = await db.collection('oauthStates').doc(state).get();
  if (!st.exists || (st.data()!.expiresAt ?? '') < nowIso() || st.data()!.provider !== 'linkedin') return back('linkedin=error&msg=state%20expired');
  await st.ref.delete(); const uid = st.data()!.uid as string;
  try {
    const t = await exchangeCode(req, code);
    const col = db.collection('users').doc(uid).collection('integrations');
    const existing = await col.where('type', '==', 'linkedin').limit(1).get();
    const ref = existing.empty ? col.doc() : existing.docs[0]!.ref;
    await ref.set({ type: 'linkedin', label: t.name || 'LinkedIn', enabled: true, config: { personUrn: t.personUrn, name: t.name, email: t.email, scopes: t.scope.split(' '), expiresAt: new Date(Date.now() + t.expiresIn * 1000).toISOString(), refreshExpiresAt: t.refreshExpiresIn ? new Date(Date.now() + t.refreshExpiresIn * 1000).toISOString() : null }, secret: seal(JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken })), createdAt: nowIso(), lastError: null }, { merge: true });
    await audit(uid, `connected LinkedIn (${t.name})`, { target: { collection: 'integrations', id: ref.id } });
    return back(`linkedin=ok&name=${encodeURIComponent(t.name)}`);
  } catch (e) { return back(`linkedin=error&msg=${encodeURIComponent((e as Error).message)}`); }
}
