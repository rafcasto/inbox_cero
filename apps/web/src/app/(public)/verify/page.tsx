'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui';
export default function Verify() {
  const { user } = useAuth(); const r = useRouter(); const [sent, setSent] = useState(false);
  useEffect(() => { const t = setInterval(async () => { await auth.currentUser?.reload(); if (auth.currentUser?.emailVerified) { await auth.currentUser.getIdToken(true); r.replace('/'); } }, 4000); return () => clearInterval(t); }, [r]);
  return (
    <div className="card p-5 space-y-3 text-sm">
      <p>Check <b>{user?.email}</b> for a verification link. This page unlocks automatically once you&apos;ve clicked it.</p>
      <Button className="w-full" onClick={async () => { if (auth.currentUser) { await sendEmailVerification(auth.currentUser); setSent(true); } }}>{sent ? 'Sent again' : 'Resend email'}</Button>
      <button className="muted text-xs underline w-full" onClick={() => signOut(auth).then(() => r.replace('/login'))}>Use a different account</button>
    </div>
  );
}
