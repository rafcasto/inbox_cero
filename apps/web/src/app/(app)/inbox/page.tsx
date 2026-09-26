'use client';
import { useMemo, useState } from 'react';
import { where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol, useKey } from '@/lib/hooks';
import { create, patch, upsert, nowIso } from '@/lib/db';
import { enqueue } from '@/lib/api';
import { H1, Empty, PriorityPill, Button, Select, Modal, Pill } from '@/components/ui';
import { cn, relTime } from '@/lib/utils';

const ACTIONS = [
  { key: '1', action: 'reply', label: 'Reply' },
  { key: '2', action: 'do', label: 'Do' },
  { key: '3', action: 'delegate', label: 'Delegate' },
  { key: '4', action: 'file', label: 'File' },
  { key: '5', action: 'ignore', label: 'Ignore' },
] as const;
const P: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
type Filter = 'triaged' | 'new' | 'filed' | 'ignored' | 'confirmed';

export default function InboxPage() {
  const { user } = useAuth(); const uid = user?.uid;
  const [filter, setFilter] = useState<Filter>('triaged');
  const items = useCol<any>(uid, 'items', [where('status', '==', filter), orderBy('receivedAt', 'desc'), limit(100)], [filter]);
  const projects = useCol<any>(uid, 'projects', [where('status', '==', 'active')]);
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<any | null>(null);
  const [override, setOverride] = useState<{ item: any; action: string } | null>(null);
  const sorted = useMemo(() => [...items.data].sort((a, b) => (P[a.triage?.priority] ?? 2) - (P[b.triage?.priority] ?? 2) || b.receivedAt.localeCompare(a.receivedAt)), [items.data]);
  const current = sorted[cursor];

  const decide = async (it: any, action: string, projectId?: string, priority?: string) => {
    if (!uid) return;
    const suggested = it.triage ?? {};
    const overrode = suggested.action !== action || (projectId && projectId !== suggested.suggestedProjectId) || (priority && priority !== suggested.priority);
    const status = action === 'ignore' ? 'ignored' : action === 'file' ? 'filed' : 'confirmed';
    await patch(uid, 'items', it.id, { status, decision: { action, projectId: projectId ?? suggested.suggestedProjectId ?? null, priority: priority ?? suggested.priority ?? 'P2', decidedAt: nowIso(), overrode: Boolean(overrode) } });
    if (overrode && it.triage) {
      const from = String(it.raw?.from ?? '');
      await create(uid, 'feedback', { itemId: it.id, suggested: { priority: suggested.priority, action: suggested.action, projectId: suggested.suggestedProjectId ?? null }, actual: { priority: priority ?? suggested.priority, action, projectId: projectId ?? null }, features: { fromDomain: from.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? '', fromEmail: from.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase() ?? '', subjectTerms: String(it.raw?.subject ?? '').toLowerCase().split(/\W+/).filter((w: string) => w.length > 3).slice(0, 8) } });
    }
    if (action === 'do' || action === 'delegate') {
      const t = await create(uid, 'tasks', { title: it.summary || it.raw?.subject || 'Task', projectId: projectId ?? suggested.suggestedProjectId ?? null, column: action === 'delegate' ? 'waitingOn' : priority === 'P0' || suggested.priority === 'P0' ? 'thisWeek' : 'backlog', order: Date.now(), priority: priority ?? suggested.priority ?? 'P2', dueAt: suggested.dueAt ?? null, sourceItemId: it.id, waitingOn: action === 'delegate' ? '' : null });
      await patch(uid, 'items', it.id, { linkedTaskId: t.id });
    }
    if (action === 'reply' && it.source?.type === 'email') enqueue('reply.draft', { itemId: it.id }).catch(() => {});
    if ((action === 'file' || action === 'ignore') && it.source?.type === 'email' && it.source.integrationId) enqueue('email.act', { integrationId: it.source.integrationId, actions: [{ itemId: it.id, action }] }).catch(() => {});
    if (it.triage?.isReceipt && action === 'file') enqueue('finance.receipt', { itemId: it.id }).catch(() => {});
    setOverride(null); setOpen(null);
    setCursor((c) => Math.min(c, Math.max(0, sorted.length - 2)));
  };

  useKey((e) => {
    if (!current) return;
    if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, sorted.length - 1)); }
    if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' || e.key === 'o') setOpen(current);
    if (e.key === 'Escape') { setOpen(null); setOverride(null); }
    if (e.key === 'y' && current.triage) decide(current, current.triage.action);
    const a = ACTIONS.find((x) => x.key === e.key);
    if (a) { if (a.action === 'do' || a.action === 'delegate') setOverride({ item: current, action: a.action }); else decide(current, a.action); }
    if (e.key === 's') patch(uid!, 'items', current.id, { status: 'snoozed', snoozedUntil: new Date(Date.now() + 86400e3).toISOString() });
  }, [current, sorted, uid]);

  return (
    <div>
      <H1 right={<div className="flex items-center gap-2"><Select value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setCursor(0); }} className="!w-auto text-xs py-1"><option value="triaged">To triage</option><option value="new">Untriaged</option><option value="confirmed">Confirmed</option><option value="filed">Filed</option><option value="ignored">Ignored</option></Select><Button className="text-xs py-1" onClick={() => enqueue('email.poll', {})}>Check mail</Button></div>}>Inbox {sorted.length > 0 && <span className="muted text-base font-normal">{sorted.length}</span>}</H1>
      <div className="hidden sm:flex gap-3 text-[11px] muted mb-3"><span><span className="kbd">j</span>/<span className="kbd">k</span> move</span><span><span className="kbd">y</span> accept</span>{ACTIONS.map((a) => <span key={a.key}><span className="kbd">{a.key}</span> {a.label}</span>)}<span><span className="kbd">s</span> snooze</span><span><span className="kbd">↵</span> open</span></div>
      {items.loading ? <div className="muted text-sm">Loading…</div> : sorted.length === 0 ? <Empty>{filter === 'triaged' ? 'Inbox zero. 🎉' : 'Nothing here.'}</Empty> : (
        <div className="space-y-1.5">
          {sorted.map((it, i) => (
            <div key={it.id} onClick={() => { setCursor(i); setOpen(it); }} className={cn('card p-3 flex items-start gap-3 cursor-pointer', i === cursor && 'border-[var(--color-accent)]')}>
              <PriorityPill p={it.triage?.priority} />
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{it.summary || it.raw?.subject || '(no subject)'}</div>
                <div className="text-xs muted truncate">{it.raw?.from?.replace(/<.*>/, '') ?? it.source?.type} · {relTime(it.receivedAt)}{it.triage?.reasoning ? ` · ${it.triage.reasoning}` : ''}</div>
              </div>
              {(filter === 'filed' || filter === 'ignored') && <Button className="text-xs py-1 shrink-0" onClick={async (e) => { e.stopPropagation(); await patch(uid!, 'items', it.id, { status: 'triaged', restoredAt: nowIso() }); if (it.governance?.approval && it.governance.approval !== 'user') { const from = String(it.raw?.from ?? ''); await create(uid!, 'feedback', { itemId: it.id, suggested: { priority: it.triage?.priority ?? 'P3', action: it.triage?.action ?? filter.replace('d', ''), projectId: null }, actual: { priority: 'P2', action: 'do', projectId: null }, features: { fromDomain: from.match(/@([\w.-]+)/)?.[1]?.toLowerCase() ?? '', fromEmail: from.match(/[\w.+-]+@[\w.-]+/)?.[0]?.toLowerCase() ?? '', subjectTerms: [] }, overrodeAuto: true }); } }}>Restore to inbox</Button>}
              {it.governance?.approval && <span className="pill p3 hidden sm:inline shrink-0" title={it.governance.reason}>{it.governance.approval}</span>}
              {it.triage && filter === 'triaged' && <div className="hidden sm:flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Pill>{it.triage.action}</Pill>
                <Button className="text-xs py-1 px-2" onClick={() => decide(it, it.triage.action)}>✓</Button>
                {ACTIONS.filter((a) => a.action !== it.triage.action).map((a) => <button key={a.key} className="kbd hover:text-[var(--color-fg)]" title={a.label} onClick={() => (a.action === 'do' || a.action === 'delegate') ? setOverride({ item: it, action: a.action }) : decide(it, a.action)}>{a.key}</button>)}
              </div>}
            </div>
          ))}
        </div>
      )}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.raw?.subject || open?.summary || 'Item'}>
        {open && <div className="space-y-3 text-sm">
          <div className="text-xs muted">{open.raw?.from} · {new Date(open.receivedAt).toLocaleString('en-NZ')} · via {open.source?.type}</div>
          {open.triage && <div className="card p-3 text-xs space-y-1"><div className="flex gap-2 items-center"><PriorityPill p={open.triage.priority} /><Pill>{open.triage.action}</Pill><span className="muted">confidence {Math.round((open.triage.confidence ?? 0) * 100)}% · {open.triage.model}</span></div><div>{open.triage.reasoning}</div>{open.triage.dueAt && <div>Due {new Date(open.triage.dueAt).toLocaleDateString('en-NZ')}</div>}</div>}
          {open.draft && <div className="card p-3 text-xs"><div className="font-medium mb-1">Draft reply · {open.draft.subject}</div><pre className="whitespace-pre-wrap font-sans">{open.draft.body}</pre><Button className="mt-2 text-xs py-1" onClick={() => navigator.clipboard.writeText(open.draft.body)}>Copy</Button></div>}
          <pre className="whitespace-pre-wrap font-sans text-sm max-h-72 overflow-y-auto">{open.raw?.body ?? open.raw?.snippet}</pre>
          <div className="flex flex-wrap gap-2 pt-2">{ACTIONS.map((a) => <Button key={a.key} variant={open.triage?.action === a.action ? 'primary' : 'ghost'} onClick={() => (a.action === 'do' || a.action === 'delegate') ? setOverride({ item: open, action: a.action }) : decide(open, a.action)}>{a.label}</Button>)}{!open.draft && open.source?.type === 'email' && <Button onClick={() => enqueue('reply.draft', { itemId: open.id })}>Draft reply</Button>}</div>
        </div>}
      </Modal>
      <Modal open={Boolean(override)} onClose={() => setOverride(null)} title={override?.action === 'delegate' ? 'Delegate' : 'Create task'}>
        {override && <OverrideForm item={override.item} action={override.action} projects={projects.data} onSubmit={(pid, pr) => decide(override.item, override.action, pid, pr)} />}
      </Modal>
    </div>
  );
}

function OverrideForm({ item, action, projects, onSubmit }: { item: any; action: string; projects: any[]; onSubmit: (projectId?: string, priority?: string) => void }) {
  const [pid, setPid] = useState(item.triage?.suggestedProjectId ?? ''); const [pr, setPr] = useState(item.triage?.priority ?? 'P2');
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(pid || undefined, pr); }}>
      <div className="text-sm">{item.summary || item.raw?.subject}</div>
      <label className="block"><span className="label">Project</span><Select value={pid} onChange={(e) => setPid(e.target.value)} autoFocus><option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></label>
      <label className="block"><span className="label">Priority</span><Select value={pr} onChange={(e) => setPr(e.target.value)}>{['P0', 'P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}</Select></label>
      <Button variant="primary" className="w-full">{action === 'delegate' ? 'Add to Waiting On' : 'Add to Board'}</Button>
    </form>
  );
}
