'use client';
import Link from 'next/link';
import { where, orderBy, limit } from 'firebase/firestore';
import { krProgress } from '@atlas/schemas';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { patch } from '@/lib/db';
import { enqueue } from '@/lib/api';
import { H1, Card, PriorityPill, Progress, Empty, Pill } from '@/components/ui';
import { fmtDate, fmtMoney, relTime } from '@/lib/utils';

const P: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export default function Today() {
  const { user, userDoc, profile } = useAuth(); const uid = user?.uid;
  const items = useCol<any>(uid, 'items', [where('status', '==', 'triaged'), limit(200)]);
  const tasks = useCol<any>(uid, 'tasks', [where('column', 'in', ['thisWeek', 'inProgress', 'waitingOn'])]);
  const objectives = useCol<any>(uid, 'objectives', [where('status', '==', 'active')]);
  const krs = useCol<any>(uid, 'keyResults');
  const flags = useCol<any>(uid, 'flags');
  const asks = useCol<any>(uid, 'asks', [where('status', '==', 'pending'), limit(10)]);
  const audit = useCol<any>(uid, 'audit', [orderBy('at', 'desc'), limit(8)]);
  const snap = useCol<any>(uid, 'financeSnapshots', [orderBy('computedAt', 'desc'), limit(1)]);
  const digest = useCol<any>(uid, 'digests', [orderBy('at', 'desc'), limit(1)]);
  const hot = items.data.filter((i) => ['P0', 'P1'].includes(i.triage?.priority)).sort((a, b) => P[a.triage.priority] - P[b.triage.priority]).slice(0, 5);
  const doing = tasks.data.filter((t) => t.column !== 'waitingOn').sort((a, b) => (P[a.priority] ?? 2) - (P[b.priority] ?? 2) || (a.column === 'inProgress' ? -1 : 1)).slice(0, 5);
  const waiting = tasks.data.filter((t) => t.column === 'waitingOn');
  const health = objectives.data.map((o) => { const ks = krs.data.filter((k) => k.objectiveId === o.id); return { o, progress: ks.length ? ks.reduce((a, k) => a + krProgress(k), 0) / ks.length : 0, conf: ks.length ? ks.reduce((a, k) => a + (k.confidence ?? 5), 0) / ks.length : 0 }; });
  const greeting = new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening';
  return (
    <div className="space-y-6">
      <H1 right={<span className="text-xs muted">{new Date().toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' })}</span>}>{greeting}{userDoc?.displayName ? `, ${userDoc.displayName.split(' ')[0]}` : ''}</H1>
      {digest.data[0] && digest.data[0].date === new Date().toISOString().slice(0, 10) && <Link href="/settings?tab=automations" className="card p-3 text-sm flex gap-2"><span>☀️</span><span className="flex-1">{digest.data[0].oneLiner}</span><span className="text-xs muted shrink-0">today's digest</span></Link>}
      {health.length > 0 && (
        <Link href="/okrs" className="card p-3 flex gap-4 overflow-x-auto">
          {health.map(({ o, progress, conf }) => <div key={o.id} className="min-w-40 flex-1"><div className="text-xs truncate mb-1">{o.title}</div><Progress value={progress} /><div className="text-[10px] muted mt-1">{Math.round(progress * 100)}% · confidence {conf.toFixed(1)}</div></div>)}
        </Link>
      )}
      {(asks.data.length > 0 || profile.governance?.paused) && (
        <section>
          <h2 className="text-sm font-medium mb-2">Needs your decision</h2>
          {profile.governance?.paused && <div className="card p-3 text-sm mb-2 flex items-center gap-2"><Pill className="p1">paused</Pill><span className="flex-1">Autonomy paused — {profile.governance.pausedReason}</span><Link href="/settings?tab=governance" className="text-xs underline">Settings</Link></div>}
          <div className="space-y-2">{asks.data.map((a) => <div key={a.id} className="card p-3 text-sm"><div className="mb-2">{a.question}{a.context?.reviewer && <span className="block text-xs muted mt-0.5">reviewer: {a.context.reviewer}</span>}</div><div className="flex gap-2 flex-wrap">{a.options.map((o: any) => <button key={o.key} className="btn btn-ghost text-xs py-1" onClick={() => { patch(uid!, 'asks', a.id, { status: 'answered', answer: o.key, answeredVia: 'portal', answeredAt: new Date().toISOString() }); enqueue('ask.answer', { askId: a.id, answer: o.key, via: 'portal' }).catch(() => {}); }}>{o.label}</button>)}</div></div>)}</div>
        </section>
      )}
      <section>
        <h2 className="text-sm font-medium mb-2">Needs you</h2>
        {hot.length === 0 && doing.length === 0 ? <Empty>Nothing urgent. Inbox has {items.data.length} to triage.</Empty> : (
          <div className="space-y-2">
            {hot.map((i) => <Link key={i.id} href="/inbox" className="card p-3 flex items-center gap-3"><PriorityPill p={i.triage.priority} /><div className="min-w-0 flex-1"><div className="text-sm truncate">{i.summary || i.raw?.subject}</div><div className="text-xs muted truncate">{i.triage.action} · {i.raw?.from?.replace(/<.*>/, '')} · {relTime(i.receivedAt)}</div></div></Link>)}
            {doing.map((t) => <div key={t.id} className="card p-3 flex items-center gap-3"><input type="checkbox" className="accent-[var(--color-accent)]" onChange={() => patch(uid!, 'tasks', t.id, { column: 'done', completedAt: new Date().toISOString() })} /><div className="min-w-0 flex-1"><div className="text-sm truncate">{t.title}</div><div className="text-xs muted">{t.column === 'inProgress' ? 'in progress' : 'this week'}{t.dueAt ? ` · due ${fmtDate(t.dueAt)}` : ''}</div></div><PriorityPill p={t.priority} /></div>)}
          </div>
        )}
      </section>
      {waiting.length > 0 && <section><h2 className="text-sm font-medium mb-2">Waiting on others</h2><div className="space-y-1">{waiting.map((t) => <div key={t.id} className="text-sm flex justify-between gap-2"><span className="truncate">{t.title}</span><span className="muted shrink-0">{t.waitingOn || '?'} · {relTime(t.updatedAt)}</span></div>)}</div></section>}
      {flags.data.length > 0 && <section><h2 className="text-sm font-medium mb-2">Governance</h2><div className="space-y-1">{flags.data.map((f) => <Link key={f.id} href={f.ref.collection === 'projects' ? '/board' : '/okrs'} className="text-sm flex gap-2 items-start"><Pill className="p1 shrink-0">flag</Pill><span>{f.message}</span></Link>)}</div></section>}
      <div className="grid sm:grid-cols-2 gap-4">
        {snap.data[0] && <Link href="/finance" className="card p-4"><div className="text-xs muted">Burn this month</div><div className="text-2xl font-semibold">{fmtMoney(snap.data[0].spend)}</div><div className="text-xs muted">run-rate {fmtMoney(snap.data[0].runRate)}/mo · {snap.data[0].unreviewed ?? 0} unreviewed</div></Link>}
        <Card><div className="text-xs muted mb-2">What your Chief of Staff did</div>{audit.data.length === 0 ? <div className="text-sm muted">Nothing yet.</div> : audit.data.map((a) => <div key={a.id} className="text-xs flex gap-2 py-0.5 items-center"><span className="muted shrink-0 w-8">{relTime(a.at)}</span><span className="truncate flex-1">{a.action}</span>{a.approval && <span className={`pill shrink-0 ${a.approval === 'user' || a.approval === 'rule' ? '' : a.approval === 'denied' || a.approval === 'floor' || a.approval === 'paused' ? 'p1' : 'p3'}`} title={a.reason ?? ''}>{a.approval}</span>}</div>)}</Card>
      </div>
    </div>
  );
}
