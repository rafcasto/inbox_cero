import 'server-only';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { NextResponse } from 'next/server';

const init = () => {
  if (getApps().length) return;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 not set');
  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET });
};
export const adminDb = () => { init(); const db = getFirestore(); try { db.settings({ ignoreUndefinedProperties: true }); } catch {} return db; };
export const adminAuth = () => { init(); return getAuth(); };
export const adminStorage = () => { init(); return getStorage(); };
export { FieldValue };
export const nowIso = () => new Date().toISOString();

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** Verify the Firebase ID token in Authorization: Bearer. Returns uid + claims. */
export const requireUser = async (req: Request, opts: { verified?: boolean; admin?: boolean } = { verified: true }) => {
  const h = req.headers.get('authorization') ?? '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'missing token');
  const t = await adminAuth().verifyIdToken(token).catch(() => { throw new HttpError(401, 'invalid token'); });
  if (opts.verified !== false && !t.email_verified) throw new HttpError(403, 'email not verified');
  if (opts.admin && !t.admin) throw new HttpError(403, 'admin only');
  return { uid: t.uid, email: t.email ?? '', admin: Boolean(t.admin) };
};

export const handle = (fn: (req: Request, ctx: any) => Promise<Response | object>) => async (req: Request, ctx: any) => {
  try {
    const r = await fn(req, ctx);
    return r instanceof Response ? r : NextResponse.json(r);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status });
  }
};

export const audit = (uid: string, action: string, extra: Record<string, unknown> = {}) => adminDb().collection('users').doc(uid).collection('audit').add({ at: nowIso(), actor: 'portal', action, ...extra });
