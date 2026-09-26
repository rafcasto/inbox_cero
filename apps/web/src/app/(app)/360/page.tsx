'use client';
import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { H1, Card, Select, Pill, Empty } from '@/components/ui';
import { cn, relTime } from '@/lib/utils';

const TYPES = ['agent.run', 'file.move', 'file.pull', 'file.push', 'job.run', 'triage', 'provision', 'governance', 'finance', 'session', 'content', 'system'];

/** 360: every agent action, file move and job run across all projects, from the events table (audit). */
export default function ThreeSixty() {
  const { user } = useAuth(); const uid = user?.uid;
  const events = useCol<any>(uid, 'audit', [orderBy('at', 'desc'), limit(500)]);
  const projects = useCol<any>(uid, 'projects');
  const [proj, setProj] = useState(''); const [type, setType] = useState(''); const [days, setDays] = useState(7);
  const since = useMemo(() => new Date(Date.now() - days * 86400e3).toISOString(), [days]);
  const rows = useMemo(() => events.data.filter((e) => e.at >= since && (!proj || (proj === 'none' ? !e.projectId : e.projectId === proj)) && (!type || (e.actionType ?? 'system') === type)), [events.data, since, proj, type]);
  const pname = (id?: string) => projects.data.find((p) => p.id === id)?.name ?? (id ? id.slice(0, 6) : '—');
  const byProject = useMemo(() => { const m = new Map<string, { n: number; cost: number }>(); for (const e of rows) { const k = e.projectId ?? 'none'; const x = m.get(k) ?? { n: 0, cost: 0 }; x.n++; x.cost += e.costUsd ?? 0; m.set(k, x); } return [...m].sort((a, b) => b[1].n - a[1].n); }, [rows]);
  const byDay = useMemo(() => { const m = new Map<string, number>(); for (const e of rows) { const d = e.at.slice(0, 10); m.set(d, (m.get(d) ?? 0) + 1); } return [...m].sort(); }, [rows]);
  const max = Math.max(1, ...byDay.map(([, n]) => n));
  return (
    <div>
      <H1 right={<div className="flex gap-1"><Select className="!w-auto text-xs py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d} d</option>)}</Select><Select className="!w-auto text-xs py-1" value={proj} onChange={(e) => setProj(e.target.value)}><option value="">All projects</option><option value="none">No project</option>{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><Select className="!w-auto text-xs py-1" value={type} onChange={(e) => setType(e.target.value)}><option value="">All actions</option>{TYPES.map((t) => <option key={t}>{t}</option>)}</Select></div>}>360</H1>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <Card><div className="text-xs muted">Actions</div><div className="text-2xl font-semibold">{rows.length}</div><div className="text-xs muted">last {days} days</div></Card>
        <Card><div className="text-xs muted">Agent cost</div><div className="text-2xl font-semibold">${rows.reduce((a, e) => a + (e.costUsd ?? 0), 0).toFixed(2)}</div><div className="text-xs muted">{rows.filter((e) => e.actionType === 'agent.run').length} runs</div></Card>
        <Card><div className="text-xs muted">Per day</div><div className="flex items-end gap-0.5 h-10 mt-1">{byDay.slice(-30).map(([d, n]) => <div key={d} title={`${d}: ${n}`} className="flex-1 rounded-t" style={{ height: `${(n / max) * 40}px`, background: 'var(--color-accent)' }} />)}</div></Card>
      </div>
      <div className="grid sm:grid-cols-[200px_1fr] gap-4">
        <Card className="text-sm"><div className="text-xs font-medium mb-2">By project</div>{byProject.map(([k, v]) => <button key={k} onClick={() => setProj(k === 'none' ? 'none' : k)} className={cn('flex justify-between w-full py-1 text-left', proj === k && 'text-[var(--color-accent)]')}><span className="truncate">{k === 'none' ? '— no project' : pname(k)}</span><span className="muted">{v.n}{v.cost ? ` · $${v.cost.toFixed(2)}` : ''}</span></button>)}{byProject.length === 0 && <div className="text-xs muted">nothing yet</div>}</Card>
        <div className="space-y-1">
          {rows.length === 0 ? <Empty>No events in this window.</Empty> : rows.slice(0, 300).map((e) => <div key={e.id} className="card px-3 py-2 text-sm flex items-center gap-2"><span className="muted text-[11px] w-10 shrink-0">{relTime(e.at)}</span><Pill className="shrink-0">{e.actionType ?? 'system'}</Pill><span className="truncate flex-1" title={e.reason ?? ''}>{e.action}</span>{e.projectId && <span className="text-[11px] muted shrink-0 truncate max-w-28">{pname(e.projectId)}</span>}{e.approval && <span className={`pill shrink-0 ${['denied', 'floor', 'paused'].includes(e.approval) ? 'p1' : 'p3'}`}>{e.approval}</span>}{e.costUsd ? <span className="text-[11px] muted shrink-0">${e.costUsd.toFixed(3)}</span> : null}</div>)}
        </div>
      </div>
    </div>
  );
}
