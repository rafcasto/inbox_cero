'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { Profile, type Profile as ProfileT } from '@atlas/schemas';
import { auth, db } from './firebase/client';

export type UserDoc = { email: string; displayName?: string; timezone: string; onboardingComplete: boolean; status?: string; whatsappNumber?: string; remindersToken?: string; createdAt: string };
type Ctx = { user: User | null; loading: boolean; userDoc: UserDoc | null; userDocLoaded: boolean; dataError: string | null; profile: ProfileT; isAdmin: boolean; refreshClaims: () => Promise<void> };
const AuthCtx = createContext<Ctx>({ user: null, loading: true, userDoc: null, userDocLoaded: false, dataError: null, profile: Profile.parse({}), isAdmin: false, refreshClaims: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [profile, setProfile] = useState<ProfileT>(Profile.parse({}));
  const [isAdmin, setIsAdmin] = useState(false);
  const [userDocLoaded, setUserDocLoaded] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const refreshClaims = async () => { if (!auth.currentUser) return; const t = await auth.currentUser.getIdTokenResult(true); setIsAdmin(Boolean(t.claims.admin)); };
  useEffect(() => onAuthStateChanged(auth, async (u) => { setUser(u); setLoading(false); if (u) { const t = await u.getIdTokenResult(); setIsAdmin(Boolean(t.claims.admin)); } }), []);
  useEffect(() => {
    if (!user) { setUserDoc(null); setUserDocLoaded(false); setDataError(null); return; }
    setUserDocLoaded(false); setDataError(null);
    const fail = (e: { code?: string; message: string }) => { setUserDocLoaded(true); setDataError(e.code === 'permission-denied' ? 'Firestore refused the read. Either the database is not created/enabled in the Firebase project yet, or the security rules are not deployed, or your email is unverified.' : `${e.code ?? 'error'}: ${e.message}`); };
    const u1 = onSnapshot(doc(db, 'users', user.uid), (s) => { setUserDoc(s.exists() ? (s.data() as UserDoc) : null); setUserDocLoaded(true); }, fail);
    const u2 = user.emailVerified ? onSnapshot(doc(db, 'users', user.uid, 'profile', 'main'), (s) => setProfile(Profile.parse(s.exists() ? s.data() : {})), (e) => console.warn('profile', e.code)) : () => {};
    return () => { u1(); u2(); };
  }, [user]);
  return <AuthCtx.Provider value={{ user, loading, userDoc, userDocLoaded, dataError, profile, isAdmin, refreshClaims }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
