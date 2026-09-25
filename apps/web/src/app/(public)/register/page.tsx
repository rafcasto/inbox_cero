'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, signInWithPopup, sendEmailVerification, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, google, db } from '@/lib/firebase/client';
import { Button, Input, Field } from '@/components/ui';

const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Pacific/Auckland'; } catch { return 'Pacific/Auckland'; } };

export default function Register() {
  const r = useRouter();
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const validate = async () => { const res = await fetch('/api/invites/validate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.trim() }) }); const j = await res.json(); if (!j.ok) throw new Error(j.error ?? 'Invalid invite code'); };
  const finish = async () => {
    const u = auth.currentUser!;
    if (!(await getDoc(doc(db, 'users', u.uid))).exists()) {
      await setDoc(doc(db, 'users', u.uid), { email: u.email, displayName: name || u.displayName || '', createdAt: new Date().toISOString(), timezone: tz(), onboardingComplete: false, status: 'active' });
    }
    await fetch('/api/invites/consume', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await u.getIdToken()}` }, body: JSON.stringify({ code: code.trim() }) });
    if (!u.emailVerified) await sendEmailVerification(u);
    r.replace('/');
  };
  const go = async (fn: () => Promise<unknown>) => { setErr(''); setBusy(true); try { await validate(); await fn(); await finish(); } catch (e: any) { setErr(e.code?.replace('auth/', '').replace(/-/g, ' ') ?? e.message); } finally { setBusy(false); } };
  return (
    <form className="card p-5 space-y-3" onSubmit={(e) => { e.preventDefault(); go(async () => { const c = await createUserWithEmailAndPassword(auth, email, pw); if (name) await updateProfile(c.user, { displayName: name }); }); }}>
      <Field label="Invite code"><Input value={code} onChange={(e) => setCode(e.target.value)} required autoCapitalize="characters" /></Field>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></Field>
      <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></Field>
      <Field label="Password" hint="8+ characters"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={8} required /></Field>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <Button variant="primary" className="w-full" disabled={busy}>Create account</Button>
      <Button type="button" className="w-full" disabled={busy || !code} onClick={() => go(() => signInWithPopup(auth, google))}>Continue with Google</Button>
      <p className="text-xs muted text-center pt-1">Already registered? <Link href="/login" className="underline">Sign in</Link></p>
    </form>
  );
}
