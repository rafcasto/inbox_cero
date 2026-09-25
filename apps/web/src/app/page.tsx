'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
export default function Home() {
  const { user, loading, userDoc } = useAuth();
  const r = useRouter();
  useEffect(() => { if (loading) return; if (!user) r.replace('/login'); else if (!user.emailVerified) r.replace('/verify'); else if (userDoc && !userDoc.onboardingComplete) r.replace('/onboarding'); else if (userDoc) r.replace('/today'); }, [user, loading, userDoc, r]);
  return <div className="p-8 muted text-sm">Loading…</div>;
}
