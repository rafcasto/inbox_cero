'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, google } from '@/lib/firebase/client';
import { Button, Input, Field } from '@/components/ui';

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const go = async (fn: () => Promise<unknown>) => { setErr(''); setBusy(true); try { await fn(); r.replace('/'); } catch (e: any) { setErr(e.code?.replace('auth/', '').replace(/-/g, ' ') ?? e.message); } finally { setBusy(false); } };
  return (
    <form className="card p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); go(() => signInWithEmailAndPassword(auth, email, pw)); }}>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
      <Field label="Password"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button variant="primary" className="w-full" disabled={busy}>Sign in</Button>
      <Button type="button" className="w-full" disabled={busy} onClick={() => go(() => signInWithPopup(auth, google))}>Continue with Google</Button>
      <div className="flex justify-between text-xs muted pt-1"><Link href="/reset-password">Forgot password</Link><Link href="/register">Have an invite?</Link></div>
    </form>
  );
}
