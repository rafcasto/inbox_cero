'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import { LoadingState } from '@/components/LoadingState';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, userDoc, userDocLoaded, dataError } = useAuth();
  const r = useRouter(); const path = usePathname();
  useEffect(() => {
    if (loading) return;
    if (!user) r.replace('/login');
    else if (!user.emailVerified) r.replace('/verify');
    else if (userDocLoaded && !userDoc) r.replace('/');
    else if (userDoc && !userDoc.onboardingComplete && path !== '/onboarding') r.replace('/onboarding');
  }, [user, loading, userDoc, userDocLoaded, path, r]);
  if (loading || !user || !userDoc) return <LoadingState error={dataError} stage={user ? 'your workspace' : undefined} />;
  if (path === '/onboarding') return <div className="min-h-dvh flex items-center justify-center p-4"><div className="w-full max-w-md">{children}</div></div>;
  return <Shell>{children}</Shell>;
}
