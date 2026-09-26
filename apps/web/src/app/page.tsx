'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth';
import { LoadingState } from '@/components/LoadingState';

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Pacific/Auckland'; } catch { return 'Pacific/Auckland'; } };

export default function Home() {
  const { user, loading, userDoc, userDocLoaded, dataError } = useAuth();
  const r = useRouter();
  const [healing, setHealing] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!user) { r.replace('/login'); return; }
    if (!user.emailVerified) { r.replace('/verify'); return; }
    if (!userDocLoaded) return;
    if (!userDoc) {
      // Signed in (e.g. Google) but no users/{uid} doc yet — create it so the app can proceed.
      if (!healing) { setHealing(true); setDoc(doc(db, 'users', user.uid), { email: user.email, displayName: user.displayName ?? '', createdAt: new Date().toISOString(), timezone: tz(), onboardingComplete: false, status: 'active' }).catch((e) => console.error('create user doc', e)); }
      return;
    }
    r.replace(userDoc.onboardingComplete ? '/today' : '/onboarding');
  }, [user, loading, userDoc, userDocLoaded, healing, r]);
  return <LoadingState error={dataError} stage={!loading && user ? 'your workspace' : undefined} />;
}
