'use client';
import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase/client';
import { Button, Input, Field } from '@/components/ui';
export default function Reset() {
  const [email, setEmail] = useState(''); const [done, setDone] = useState(false); const [err, setErr] = useState('');
  return (
    <form className="card p-5 space-y-3" onSubmit={async (e) => { e.preventDefault(); setErr(''); try { await sendPasswordResetEmail(auth, email); setDone(true); } catch (e: any) { setErr(e.message); } }}>
      {done ? <p className="text-sm">If that address exists, a reset link is on its way.</p> : <>
        <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button variant="primary" className="w-full">Send reset link</Button></>}
      <p className="text-xs muted text-center"><Link href="/login" className="underline">Back to sign in</Link></p>
    </form>
  );
}
