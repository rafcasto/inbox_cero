'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth';
import { Button, Input, Textarea, Field } from '@/components/ui';
import { DEFAULT_CATEGORIES } from '@atlas/schemas';

export default function Onboarding() {
  const { user } = useAuth(); const r = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user?.displayName ?? ''); const [roles, setRoles] = useState(''); const [bio, setBio] = useState('');
  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [p3, setP3] = useState('');
  const [never, setNever] = useState('newsletters, promotions, sales offers, subscription notifications'); const [always, setAlways] = useState('');
  const finish = async (skip = false) => {
    if (!user) return;
    const uid = user.uid;
    if (!skip) {
      await setDoc(doc(db, 'users', uid, 'profile', 'main'), {
        identity: { name, roles: roles.split(',').map((s) => s.trim()).filter(Boolean), bio, currentPriorities: [p1, p2, p3].filter(Boolean) },
        noise: { neverSurface: never.split(',').map((s) => s.trim()).filter(Boolean), alwaysSurface: always.split(',').map((s) => s.trim()).filter(Boolean) },
      }, { merge: true });
    }
    for (const c of DEFAULT_CATEGORIES) await setDoc(doc(db, 'users', uid, 'categories', c.id), { ...c, order: DEFAULT_CATEGORIES.indexOf(c) }, { merge: true });
    await setDoc(doc(db, 'users', uid, 'areas', 'general'), { name: 'General', description: 'Default area', isMaintenance: false, order: 0, archived: false }, { merge: true });
    await setDoc(doc(db, 'users', uid, 'areas', 'maintenance'), { name: 'Maintenance', description: 'Keeping the lights on', isMaintenance: true, order: 99, archived: false }, { merge: true });
    await updateDoc(doc(db, 'users', uid), { onboardingComplete: true, displayName: name || user.displayName || '' });
    r.replace(step === 2 ? '/settings?tab=integrations' : '/today');
  };
  const steps = [
    <div key="0" className="space-y-3">
      <h1 className="text-lg font-semibold">Who are you?</h1>
      <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Roles" hint="comma separated — founder, consultant, parent…"><Input value={roles} onChange={(e) => setRoles(e.target.value)} /></Field>
      <Field label="One paragraph about you and your work"><Textarea value={bio} onChange={(e) => setBio(e.target.value)} /></Field>
    </div>,
    <div key="1" className="space-y-3">
      <h1 className="text-lg font-semibold">Top priorities right now</h1>
      <p className="text-sm muted">These steer triage until you set OKRs.</p>
      <Input placeholder="1." value={p1} onChange={(e) => setP1(e.target.value)} /><Input placeholder="2." value={p2} onChange={(e) => setP2(e.target.value)} /><Input placeholder="3." value={p3} onChange={(e) => setP3(e.target.value)} />
    </div>,
    <div key="2" className="space-y-3">
      <h1 className="text-lg font-semibold">What is noise?</h1>
      <Field label="Never surface" hint="senders, domains or words, comma separated"><Textarea value={never} onChange={(e) => setNever(e.target.value)} /></Field>
      <Field label="Always surface" hint="e.g. accountant, a client's domain, your partner's email"><Textarea value={always} onChange={(e) => setAlways(e.target.value)} /></Field>
      <p className="text-xs muted">Next: connect a mailbox in Settings → Integrations.</p>
    </div>,
  ];
  return (
    <div className="card p-5 space-y-4">
      <div className="flex gap-1">{steps.map((_, i) => <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? 'var(--color-accent)' : 'var(--color-line)' }} />)}</div>
      {steps[step]}
      <div className="flex justify-between pt-2">
        <button className="text-xs muted underline" onClick={() => finish(true)}>Skip for now</button>
        <div className="flex gap-2">{step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}{step < steps.length - 1 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Next</Button> : <Button variant="primary" onClick={() => finish()}>Finish</Button>}</div>
      </div>
    </div>
  );
}
