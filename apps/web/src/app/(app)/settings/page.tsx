'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { updateEmail, updatePassword, signOut, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { orderBy } from 'firebase/firestore';
import { Profile, DEFAULT_CATEGORIES } from '@atlas/schemas';
import { auth, db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { patch, upsert, remove } from '@/lib/db';
import { api, enqueue } from '@/lib/api';
import { H1, Button, Input, Select, Field, Textarea, Card, Pill } from '@/components/ui';
import { cn, randomToken } from '@/lib/utils';

const TABS = ['profile', 'rules', 'voice', 'finance', 'okr', 'ai', 'integrations', 'account'] as const;
type Tab = (typeof TABS)[number];

export default function SettingsPage() { return <Suspense><Settings /></Suspense>; }

function Settings() {
  const { user, userDoc, profile } = useAuth(); const uid = user?.uid;
  const sp = useSearchParams(); const r = useRouter();
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'profile') as Tab;
  const [p, setP] = useState(profile); const [dirty, setDirty] = useState(false); const [saved, setSaved] = useState('');
  useEffect(() => { if (!dirty) setP(profile); }, [profile, dirty]);
  const set = (path: string, v: unknown) => { setDirty(true); setP((x) => { const n: any = structuredClone(x); const ks = path.split('.'); let o = n; for (const k of ks.slice(0, -1)) o = o[k] ??= {}; o[ks[ks.length - 1]!] = v; return n; }); };
  const save = async () => { if (!uid) return; const parsed = Profile.parse(p); await setDoc(doc(db, 'users', uid, 'profile', 'main'), parsed, { merge: true }); await updateDoc(doc(db, 'users', uid), { whatsappNumber: parsed.whatsapp.number || null }); setDirty(false); setSaved('Saved'); setTimeout(() => setSaved(''), 1500); };
  const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <div>
      <H1 right={<div className="flex items-center gap-2 text-xs">{saved && <span className="muted">{saved}</span>}<Button variant="primary" className="text-xs py-1" disabled={!dirty} onClick={save}>Save</Button></div>}>Settings</H1>
      <div className="flex gap-1 mb-5 overflow-x-auto text-sm">{TABS.map((t) => <button key={t} onClick={() => r.replace(`/settings?tab=${t}`)} className={cn('px-3 py-1 rounded-full shrink-0 capitalize', tab === t ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium' : 'muted')}>{t === 'okr' ? 'OKRs' : t === 'ai' ? 'AI' : t}</button>)}</div>

      {tab === 'profile' && <div className="space-y-3 max-w-xl">
        <Field label="Name"><Input value={p.identity.name} onChange={(e) => set('identity.name', e.target.value)} /></Field>
        <Field label="Roles" hint="comma separated"><Input value={p.identity.roles.join(', ')} onChange={(e) => set('identity.roles', list(e.target.value))} /></Field>
        <Field label="About you"><Textarea value={p.identity.bio} onChange={(e) => set('identity.bio', e.target.value)} /></Field>
        <Field label="Current priorities" hint="one per line"><Textarea value={p.identity.currentPriorities.join('\n')} onChange={(e) => set('identity.currentPriorities', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} /></Field>
        <div className="grid grid-cols-3 gap-2"><Field label="Work start"><Input type="time" value={p.workingHours.start} onChange={(e) => set('workingHours.start', e.target.value)} /></Field><Field label="Work end"><Input type="time" value={p.workingHours.end} onChange={(e) => set('workingHours.end', e.target.value)} /></Field><Field label="Timezone"><Input value={userDoc?.timezone ?? ''} onChange={(e) => uid && updateDoc(doc(db, 'users', uid), { timezone: e.target.value })} /></Field></div>
      </div>}

      {tab === 'rules' && <div className="space-y-4 max-w-xl">
        <Field label="Never surface" hint="senders, domains or words — comma separated. Zero-cost rule, runs before any AI."><Textarea value={p.noise.neverSurface.join(', ')} onChange={(e) => set('noise.neverSurface', list(e.target.value))} /></Field>
        <Field label="Always surface" hint="at least P1, never auto-filed"><Textarea value={p.noise.alwaysSurface.join(', ')} onChange={(e) => set('noise.alwaysSurface', list(e.target.value))} /></Field>
        <div><div className="label">Priority rules</div>
          {p.priorityRules.map((rule, i) => <div key={rule.id} className="card p-2 mb-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs items-end">
            <Select value={Object.keys(rule.match)[0] ?? 'fromDomain'} onChange={(e) => { const v = Object.values(rule.match)[0] ?? ''; set(`priorityRules.${i}.match`, { [e.target.value]: v }); }}><option value="fromDomain">from domain</option><option value="fromEmail">from email</option><option value="subjectContains">subject contains</option><option value="keyword">keyword</option></Select>
            <Input value={String(Object.values(rule.match)[0] ?? '')} onChange={(e) => set(`priorityRules.${i}.match`, { [Object.keys(rule.match)[0] ?? 'fromDomain']: e.target.value })} placeholder="value" />
            <Select value={rule.effect.action ?? ''} onChange={(e) => set(`priorityRules.${i}.effect.action`, e.target.value || undefined)}><option value="">— action —</option><option value="surface">surface</option><option value="file">auto-file</option><option value="ignore">ignore</option></Select>
            <Select value={rule.effect.priority ?? ''} onChange={(e) => set(`priorityRules.${i}.effect.priority`, e.target.value || undefined)}><option value="">— priority —</option>{['P0', 'P1', 'P2', 'P3'].map((x) => <option key={x}>{x}</option>)}</Select>
            <div className="flex gap-1"><Input value={rule.note} onChange={(e) => set(`priorityRules.${i}.note`, e.target.value)} placeholder="note" /><Button className="py-1" variant="danger" onClick={() => set('priorityRules', p.priorityRules.filter((_, j) => j !== i))}>✕</Button></div>
          </div>)}
          <Button className="text-xs py-1" onClick={() => set('priorityRules', [...p.priorityRules, { id: randomToken().slice(0, 8), match: { fromDomain: '' }, effect: { action: 'surface', priority: 'P1' }, note: '' }])}>+ Rule</Button>
        </div>
      </div>}

      {tab === 'voice' && <div className="space-y-3 max-w-xl">
        <Field label="Tone" hint="e.g. direct, warm, a bit dry; short sentences; no hype"><Input value={p.voice.tone} onChange={(e) => set('voice.tone', e.target.value)} /></Field>
        <Field label="Style notes"><Textarea value={p.voice.styleNotes} onChange={(e) => set('voice.styleNotes', e.target.value)} /></Field>
        <Field label="Words to avoid" hint="comma separated"><Input value={p.voice.avoidWords.join(', ')} onChange={(e) => set('voice.avoidWords', list(e.target.value))} /></Field>
        <div><div className="label">Example posts (the more the better)</div>{p.voice.examples.map((ex, i) => <div key={i} className="card p-2 mb-2 space-y-1"><Select className="!w-auto text-xs py-1" value={ex.platform} onChange={(e) => set(`voice.examples.${i}.platform`, e.target.value)}>{['linkedin', 'x', 'instagram', 'newsletter'].map((x) => <option key={x}>{x}</option>)}</Select><Textarea value={ex.text} onChange={(e) => set(`voice.examples.${i}.text`, e.target.value)} /><button className="text-xs muted underline" onClick={() => set('voice.examples', p.voice.examples.filter((_, j) => j !== i))}>remove</button></div>)}<Button className="text-xs py-1" onClick={() => set('voice.examples', [...p.voice.examples, { platform: 'linkedin', text: '' }])}>+ Example</Button></div>
      </div>}

      {tab === 'finance' && <FinanceSettings p={p} set={set} uid={uid!} />}

      {tab === 'okr' && <div className="space-y-3 max-w-xl">
        <Field label="Quarter start"><Select value={p.okr.quarterStart} onChange={(e) => set('okr.quarterStart', e.target.value)}><option value="calendar">Calendar (Jan/Apr/Jul/Oct)</option><option value="april">NZ financial year (Apr/Jul/Oct/Jan)</option></Select></Field>
        <div className="grid grid-cols-2 gap-2"><Field label="Daily check-in"><Input type="time" value={p.okr.daily.time} onChange={(e) => set('okr.daily.time', e.target.value)} /></Field><Field label="Enabled"><Select value={String(p.okr.daily.enabled)} onChange={(e) => set('okr.daily.enabled', e.target.value === 'true')}><option value="true">yes</option><option value="false">no</option></Select></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Weekly truth session — day"><Select value={p.okr.weekly.day} onChange={(e) => set('okr.weekly.day', Number(e.target.value))}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></Field><Field label="Time"><Input type="time" value={p.okr.weekly.time} onChange={(e) => set('okr.weekly.time', e.target.value)} /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Channel"><Select value={p.okr.channel} onChange={(e) => set('okr.channel', e.target.value)}><option value="whatsapp">WhatsApp</option><option value="portal">Portal</option></Select></Field><Field label="Style"><Select value={p.okr.style} onChange={(e) => set('okr.style', e.target.value)}><option value="prefilled">Pre-filled (tap to adjust)</option><option value="conversational">Conversational</option></Select></Field></div>
      </div>}

      {tab === 'ai' && <div className="space-y-3 max-w-xl">
        <p className="text-xs muted">All reasoning runs through Claude Code CLI on your Pi. Pick a model per task. Any model id or alias the CLI accepts works (e.g. <code>claude-haiku-4-5</code>, <code>claude-sonnet-4-5</code>, <code>sonnet</code>, <code>opus</code>).</p>
        {(['triage', 'drafting', 'sessions', 'summaries', 'finance'] as const).map((k) => <Field key={k} label={k}><Input value={p.ai.models[k]} onChange={(e) => set(`ai.models.${k}`, e.target.value)} list="models" /></Field>)}
        <datalist id="models">{['claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-1', 'haiku', 'sonnet', 'opus'].map((m) => <option key={m} value={m} />)}</datalist>
        <Field label="Daily call budget" hint="hard stop per day; protects your subscription/API bill"><Input type="number" value={p.ai.dailyCallBudget} onChange={(e) => set('ai.dailyCallBudget', Number(e.target.value))} /></Field>
        <UsageSummary uid={uid!} />
      </div>}

      {tab === 'integrations' && <Integrations uid={uid!} p={p} set={set} userDoc={userDoc} />}

      {tab === 'account' && <AccountSettings />}
    </div>
  );
}

function FinanceSettings({ p, set, uid }: { p: any; set: (k: string, v: unknown) => void; uid: string }) {
  const cats = useCol<any>(uid, 'categories', [orderBy('order')]);
  const [newCat, setNewCat] = useState('');
  return (
    <div className="space-y-4 max-w-xl">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Currency"><Input value={p.finance.currency} onChange={(e) => set('finance.currency', e.target.value)} /></Field>
        <Field label="GST registered"><Select value={String(p.finance.gstRegistered)} onChange={(e) => set('finance.gstRegistered', e.target.value === 'true')}><option value="false">no</option><option value="true">yes</option></Select></Field>
        <Field label="Default scope"><Select value={p.finance.defaultScope} onChange={(e) => set('finance.defaultScope', e.target.value)}><option value="business">business</option><option value="personal">personal</option></Select></Field>
        <Field label="GST rate"><Input type="number" step="0.01" value={p.finance.gstRate} onChange={(e) => set('finance.gstRate', Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Category jump alert %"><Input type="number" value={p.finance.anomaly.categoryJumpPct} onChange={(e) => set('finance.anomaly.categoryJumpPct', Number(e.target.value))} /></Field>
        <Field label="New vendor alert over"><Input type="number" value={p.finance.anomaly.newVendorThreshold} onChange={(e) => set('finance.anomaly.newVendorThreshold', Number(e.target.value))} /></Field>
        <Field label="Duplicate window (days)"><Input type="number" value={p.finance.anomaly.duplicateWindowDays} onChange={(e) => set('finance.anomaly.duplicateWindowDays', Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Receipt nudge"><Select value={p.finance.nudges.receipts} onChange={(e) => set('finance.nudges.receipts', e.target.value)}><option value="weekly">weekly</option><option value="off">off</option></Select></Field>
        <Field label="Income nudge"><Select value={p.finance.nudges.income} onChange={(e) => set('finance.nudges.income', e.target.value)}><option value="monthly">monthly</option><option value="off">off</option></Select></Field>
        <Field label="Unreviewed nudge"><Select value={p.finance.nudges.unreviewed} onChange={(e) => set('finance.nudges.unreviewed', e.target.value)}><option value="weekly">weekly</option><option value="off">off</option></Select></Field>
      </div>
      <div><div className="label">Categories</div>
        {cats.data.map((c) => <div key={c.id} className="flex gap-2 items-center mb-1 text-sm"><Input className="py-1" value={c.name} onChange={(e) => patch(uid, 'categories', c.id, { name: e.target.value })} /><Select className="!w-32 py-1" value={c.defaultScope} onChange={(e) => patch(uid, 'categories', c.id, { defaultScope: e.target.value })}><option value="business">business</option><option value="personal">personal</option></Select><Input className="!w-28 py-1" placeholder="ext. code" value={c.externalCode ?? ''} onChange={(e) => patch(uid, 'categories', c.id, { externalCode: e.target.value })} /><Button className="py-1" variant="danger" onClick={() => remove(uid, 'categories', c.id)}>✕</Button></div>)}
        <form className="flex gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); if (newCat.trim()) { upsert(uid, 'categories', newCat.toLowerCase().replace(/[^a-z0-9]+/g, '-'), { name: newCat.trim(), defaultScope: 'business', order: cats.data.length }); setNewCat(''); } }}><Input placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} /><Button>Add</Button></form>
        {cats.data.length === 0 && <Button className="text-xs py-1 mt-2" onClick={() => DEFAULT_CATEGORIES.forEach((c, i) => upsert(uid, 'categories', c.id, { ...c, order: i }))}>Load defaults</Button>}
      </div>
    </div>
  );
}

function UsageSummary({ uid }: { uid: string }) {
  const logs = useCol<any>(uid, 'usageLogs', [orderBy('at', 'desc')]);
  const month = new Date().toISOString().slice(0, 7);
  const m = logs.data.filter((l) => l.at.startsWith(month));
  const cost = m.reduce((a, l) => a + (l.costUsd ?? 0), 0);
  const byTask = m.reduce<Record<string, number>>((o, l) => { o[l.task] = (o[l.task] ?? 0) + 1; return o; }, {});
  return <Card className="text-xs"><div className="font-medium mb-1">This month</div><div>{m.length} Claude calls · ${cost.toFixed(2)} equivalent API cost · {m.reduce((a, l) => a + (l.tokensIn ?? 0), 0).toLocaleString()} tokens in</div><div className="muted mt-1">{Object.entries(byTask).map(([t, n]) => `${t} ×${n}`).join(' · ')}</div></Card>;
}

function Integrations({ uid, p, set, userDoc }: { uid: string; p: any; set: (k: string, v: unknown) => void; userDoc: any }) {
  const integrations = useCol<any>(uid, 'integrations');
  const [form, setForm] = useState({ label: '', host: 'imap.gmail.com', port: 993, user: '', password: '', pollFolder: 'INBOX', filedFolder: 'Atlas/Filed', ignoredFolder: 'Atlas/Ignored' });
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const add = async () => { setBusy(true); setMsg(''); try { const { password, label, ...config } = form; await api('/api/integrations', { type: 'imap', label: label || form.user, config, secret: password }); setForm({ ...form, label: '', user: '', password: '' }); setMsg('Mailbox added. First poll runs within 2 minutes.'); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const ensureToken = async () => { const t = userDoc?.remindersToken ?? randomToken(); if (!userDoc?.remindersToken) await updateDoc(doc(db, 'users', uid), { remindersToken: t }); return t; };
  const [tok, setTok] = useState('');
  return (
    <div className="space-y-6 max-w-xl">
      <section><h3 className="font-medium text-sm mb-2">Mailboxes (IMAP)</h3>
        {integrations.data.filter((i) => i.type === 'imap').map((i) => <div key={i.id} className="card p-3 text-sm flex items-center gap-2 mb-2"><div className="flex-1 min-w-0"><div className="truncate">{i.label} <span className="muted">{i.config?.user}</span></div><div className="text-xs muted">{i.lastError ? <span className="text-red-600">{i.lastError}</span> : i.lastSyncAt ? `synced ${new Date(i.lastSyncAt).toLocaleString('en-NZ')}` : 'never synced'}</div></div><Pill className={i.enabled ? '' : 'p3'}>{i.enabled ? 'on' : 'off'}</Pill><Button className="text-xs py-1" onClick={() => patch(uid, 'integrations', i.id, { enabled: !i.enabled })}>{i.enabled ? 'Disable' : 'Enable'}</Button><Button className="text-xs py-1" onClick={() => enqueue('email.poll', { integrationId: i.id })}>Poll now</Button><Button className="text-xs py-1" variant="danger" onClick={() => remove(uid, 'integrations', i.id)}>✕</Button></div>)}
        <div className="card p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2"><Field label="Label"><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Personal Gmail" /></Field><Field label="IMAP host"><Input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></Field><Field label="Email / username"><Input value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} autoComplete="off" /></Field><Field label="App password" hint="Gmail: Google Account → Security → App passwords"><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></Field></div>
          <details className="text-xs"><summary className="muted cursor-pointer">Folders</summary><div className="grid grid-cols-3 gap-2 mt-2"><Field label="Poll"><Input value={form.pollFolder} onChange={(e) => setForm({ ...form, pollFolder: e.target.value })} /></Field><Field label="Filed →"><Input value={form.filedFolder} onChange={(e) => setForm({ ...form, filedFolder: e.target.value })} /></Field><Field label="Ignored →"><Input value={form.ignoredFolder} onChange={(e) => setForm({ ...form, ignoredFolder: e.target.value })} /></Field></div></details>
          <Button variant="primary" disabled={busy || !form.user || !form.password} onClick={add}>Add mailbox</Button>{msg && <span className="text-xs muted ml-2">{msg}</span>}
          <p className="text-[11px] muted">The password is encrypted with AES-256-GCM before it is stored; only the Pi can decrypt it.</p>
        </div>
      </section>
      <section><h3 className="font-medium text-sm mb-2">WhatsApp</h3><div className="grid grid-cols-3 gap-2"><Field label="Your number" hint="international, digits only"><Input value={p.whatsapp.number} onChange={(e) => set('whatsapp.number', e.target.value.replace(/\D/g, ''))} placeholder="6421…" /></Field><Field label="Quiet from"><Input type="time" value={p.whatsapp.quietHours.start} onChange={(e) => set('whatsapp.quietHours.start', e.target.value)} /></Field><Field label="Quiet until"><Input type="time" value={p.whatsapp.quietHours.end} onChange={(e) => set('whatsapp.quietHours.end', e.target.value)} /></Field></div><p className="text-[11px] muted mt-1">Send anything to the Atlas number to capture it. Commands: <code>kr2 40%</code>, <code>done …</code>, <code>add …</code>, <code>idea …</code>, <code>receipt</code> + photo, <code>today</code>, <code>status</code>.</p></section>
      <section><h3 className="font-medium text-sm mb-2">Apple Reminders (iPhone Shortcut)</h3>
        <p className="text-xs muted mb-2">No Mac needed. An iOS Shortcut automation runs every 30 min and syncs both ways. Setup guide: <code>docs/reminders-shortcut.md</code>.</p>
        <div className="flex gap-2 items-center"><Button className="text-xs py-1" onClick={async () => setTok(await ensureToken())}>{userDoc?.remindersToken ? 'Show token' : 'Generate token'}</Button>{tok && <code className="text-xs break-all">{tok}</code>}<Button className="text-xs py-1" variant="danger" onClick={() => updateDoc(doc(db, 'users', uid), { remindersToken: randomToken() }).then(() => setTok(''))}>Rotate</Button></div>
        <div className="text-xs muted mt-1">Endpoint: <code>{typeof window !== 'undefined' ? window.location.origin : ''}/api/reminders/sync</code></div>
      </section>
    </div>
  );
}

function AccountSettings() {
  const { user } = useAuth(); const r = useRouter();
  const [pw, setPw] = useState(''); const [newPw, setNewPw] = useState(''); const [newEmail, setNewEmail] = useState(''); const [msg, setMsg] = useState('');
  const reauth = async () => { if (!user?.email) throw new Error('no email'); await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw)); };
  const run = async (fn: () => Promise<unknown>, ok: string) => { setMsg(''); try { await fn(); setMsg(ok); } catch (e: any) { setMsg(e.code?.replace('auth/', '') ?? e.message); } };
  return (
    <div className="space-y-4 max-w-md text-sm">
      <Field label="Current password (required for changes)"><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
      <div className="flex gap-2 items-end"><Field label="New email"><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></Field><Button onClick={() => run(async () => { await reauth(); await updateEmail(user!, newEmail); }, 'Email updated — verify the new address')}>Change</Button></div>
      <div className="flex gap-2 items-end"><Field label="New password"><Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></Field><Button onClick={() => run(async () => { await reauth(); await updatePassword(user!, newPw); }, 'Password updated')}>Change</Button></div>
      {msg && <div className="text-xs muted">{msg}</div>}
      <div className="flex gap-2 pt-4"><Button onClick={async () => { const res = await fetch('/api/export', { headers: { Authorization: `Bearer ${await user!.getIdToken()}` } }); const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'atlas-export.json'; a.click(); }}>Export all data (JSON)</Button><Button onClick={() => signOut(auth).then(() => r.replace('/login'))}>Sign out</Button></div>
      <div className="pt-6 border-t"><Button variant="danger" onClick={() => run(async () => { if (!confirm('Delete your account and all data? This cannot be undone.')) return; await reauth(); await api('/api/account/delete', {}); await signOut(auth); r.replace('/login'); }, '')}>Delete account</Button></div>
    </div>
  );
}
