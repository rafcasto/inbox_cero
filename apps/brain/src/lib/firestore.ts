import { initializeApp, cert, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { Profile, type Profile as ProfileT } from '@atlas/schemas';
import { config } from '../config';
import { log } from './log';

let db: Firestore | null = null;

export const firestore = (): Firestore => {
  if (db) return db;
  if (!getApps().length) {
    if (config.serviceAccountJson || config.serviceAccountB64) {
      const sa = JSON.parse(config.serviceAccountJson || Buffer.from(config.serviceAccountB64, 'base64').toString('utf8'));
      initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket: `${sa.project_id}.firebasestorage.app` });
    } else {
      log.warn('FIREBASE_SERVICE_ACCOUNT_JSON/_B64 not set; using application default credentials');
      initializeApp({ credential: applicationDefault(), projectId: config.projectId });
    }
  }
  db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
};

export const storage = () => getStorage();
export const userRef = (uid: string) => firestore().collection('users').doc(uid);
export const col = (uid: string, name: string) => userRef(uid).collection(name);
export const now = () => new Date().toISOString();
export { FieldValue };

export const getProfile = async (uid: string): Promise<ProfileT> => {
  const snap = await col(uid, 'profile').doc('main').get();
  return Profile.parse(snap.exists ? snap.data() : {});
};

export const audit = async (
  uid: string,
  entry: { actor: 'brain' | 'n8n' | 'portal'; action: string; target?: { collection: string; id: string }; reason?: string; promptVersion?: string; model?: string; costUsd?: number; meta?: Record<string, unknown> },
) => {
  await col(uid, 'audit').add({ at: now(), ...entry });
};

export const logUsage = async (uid: string, u: { task: string; model?: string; tokensIn: number; tokensOut: number; costUsd: number; refId?: string }) => {
  await col(uid, 'usageLogs').add({ at: now(), service: 'claude', ...u });
};

export const listDocs = async <T = Record<string, any>>(uid: string, name: string, build?: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<(T & { id: string })[]> => {
  let q: FirebaseFirestore.Query = col(uid, name);
  if (build) q = build(q);
  const s = await q.get();
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
};

export const activeUserIds = async (): Promise<string[]> => {
  const s = await firestore().collection('users').where('status', '==', 'active').select().get();
  return s.docs.map((d) => d.id);
};
