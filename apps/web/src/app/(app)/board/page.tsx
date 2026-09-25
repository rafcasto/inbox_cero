'use client';
import { useMemo, useState } from 'react';
import { where } from 'firebase/firestore';
import { DndContext, PointerSensor, TouchSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { create, patch, remove, nowIso } from '@/lib/db';
import { enqueue } from '@/lib/api';
import { H1, Button, Input, Select, Modal, Field, Textarea, PriorityPill, Pill } from '@/components/ui';
import { cn, fmtDate } from '@/lib/utils';

const COLS = [['backlog', 'Backlog'], ['thisWeek', 'This week'], ['inProgress', 'In progress'], ['waitingOn', 'Waiting on'], ['done', 'Done']] as const;

export default function Board() {
  const { user } = useAuth(); const uid = user?.uid;
  const tasks = useCol<any>(uid, 'tasks');
  const projects = useCol<any>(uid, 'projects');
  const areas = useCol<any>(uid, 'areas');
  const krs = useCol<any>(uid, 'keyResults');
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [projModal, setProjModal] = useState<any | null>(null);
  const [quick, setQuick] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }));
  const visible = useMemo(() => tasks.data.filter((t) => !filter || t.projectId === filter || (filter.startsWith('kr:') && projects.data.find((p) => p.id === t.projectId)?.keyResultIds?.includes(filter.slice(3)))).filter((t) => t.column !== 'done' || (t.completedAt ?? '') > new Date(Date.now() - 7 * 86400e3).toISOString()), [tasks.data, filter, projects.data]);
  const onDragEnd = (e: DragEndEvent) => { const col = e.over?.id as string | undefined; const id = e.active.id as string; if (!col || !uid) return; const t = tasks.data.find((x) => x.id === id); if (!t || t.column === col) return; patch(uid, 'tasks', id, { column: col, order: Date.now(), completedAt: col === 'done' ? nowIso() : null }); };
  const addQuick = async () => { if (!quick.trim() || !uid) return; await create(uid, 'tasks', { title: quick.trim(), column: 'backlog', order: Date.now(), priority: 'P2', projectId: filter && !filter.startsWith('kr:') ? filter : null }); setQuick(''); };
  const pname = (id?: string) => projects.data.find((p) => p.id === id)?.name;
  return (
    <div>
      <H1 right={<div className="flex gap-2"><Select value={filter} onChange={(e) => setFilter(e.target.value)} className="!w-auto text-xs py-1"><option value="">All projects</option>{projects.data.filter((p) => p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}{krs.data.length > 0 && <optgroup label="By key result">{krs.data.map((k) => <option key={k.id} value={`kr:${k.id}`}>{k.title}</option>)}</optgroup>}</Select><Button className="text-xs py-1" onClick={() => setProjModal({})}>+ Project</Button></div>}>Board</H1>
      <form className="flex gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); addQuick(); }}><Input placeholder="Quick add a task…" value={quick} onChange={(e) => setQuick(e.target.value)} /><Button variant="primary">Add</Button></form>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">{projects.data.filter((p) => p.status === 'active').map((p) => <button key={p.id} onClick={() => setProjModal(p)} className={cn('card px-3 py-1.5 text-xs shrink-0 flex items-center gap-1.5', filter === p.id && 'border-[var(--color-accent)]')}>{p.name}{!p.isMaintenance && !(p.keyResultIds?.length) && <span className="pill p1">no KR</span>}<span className="muted">{tasks.data.filter((t) => t.projectId === p.id && t.column !== 'done').length}</span></button>)}</div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          {COLS.map(([id, label]) => <Column key={id} id={id} label={label} tasks={visible.filter((t) => t.column === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))} onOpen={setEditing} pname={pname} />)}
        </div>
      </DndContext>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Task">{editing && <TaskForm task={editing} projects={projects.data} onSave={async (d) => { await patch(uid!, 'tasks', editing.id, d); setEditing(null); }} onDelete={async () => { await remove(uid!, 'tasks', editing.id); setEditing(null); }} />}</Modal>
      <Modal open={Boolean(projModal)} onClose={() => setProjModal(null)} title={projModal?.id ? 'Project' : 'New project'}>{projModal && <ProjectForm project={projModal} areas={areas.data} krs={krs.data} onSave={async (d) => { if (projModal.id) await patch(uid!, 'projects', projModal.id, d); else await create(uid!, 'projects', { ...d, status: 'active', order: Date.now() }); setProjModal(null); enqueue('governance.flags').catch(() => {}); }} />}</Modal>
    </div>
  );
}

function Column({ id, label, tasks, onOpen, pname }: { id: string; label: string; tasks: any[]; onOpen: (t: any) => void; pname: (id?: string) => string | undefined }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('rounded-[10px] p-2 min-h-32 transition', isOver && 'bg-[var(--color-accent-soft)]')} style={{ background: isOver ? undefined : 'color-mix(in srgb, var(--color-line) 40%, transparent)' }}>
      <div className="text-xs font-medium muted px-1 mb-2 flex justify-between"><span>{label}</span><span>{tasks.length}</span></div>
      <div className="space-y-1.5">{tasks.map((t) => <Card key={t.id} t={t} onOpen={onOpen} pname={pname} />)}</div>
    </div>
  );
}
function Card({ t, onOpen, pname }: { t: any; onOpen: (t: any) => void; pname: (id?: string) => string | undefined }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={() => onOpen(t)} style={{ transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined }} className={cn('card p-2.5 text-sm cursor-grab active:cursor-grabbing select-none', isDragging && 'opacity-60 shadow-lg')}>
      <div className={cn(t.column === 'done' && 'line-through muted')}>{t.title}</div>
      <div className="flex gap-1.5 mt-1.5 items-center text-[10px] muted flex-wrap">{t.priority !== 'P2' && <PriorityPill p={t.priority} />}{pname(t.projectId) && <span className="truncate">{pname(t.projectId)}</span>}{t.dueAt && <span>due {fmtDate(t.dueAt)}</span>}{t.waitingOn && <span>⏳ {t.waitingOn}</span>}{t.syncToReminders && <span>⏰</span>}</div>
    </div>
  );
}
function TaskForm({ task, projects, onSave, onDelete }: { task: any; projects: any[]; onSave: (d: any) => void; onDelete: () => void }) {
  const [d, setD] = useState({ title: task.title ?? '', projectId: task.projectId ?? '', column: task.column ?? 'backlog', priority: task.priority ?? 'P2', dueAt: task.dueAt?.slice(0, 10) ?? '', waitingOn: task.waitingOn ?? '', syncToReminders: Boolean(task.syncToReminders), notes: task.notes ?? '' });
  const s = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, projectId: d.projectId || null, dueAt: d.dueAt ? new Date(d.dueAt).toISOString() : null, completedAt: d.column === 'done' ? (task.completedAt ?? nowIso()) : null }); }}>
      <Field label="Title"><Input value={d.title} onChange={(e) => s('title', e.target.value)} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project"><Select value={d.projectId} onChange={(e) => s('projectId', e.target.value)}><option value="">— none —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Column"><Select value={d.column} onChange={(e) => s('column', e.target.value)}>{COLS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select></Field>
        <Field label="Priority"><Select value={d.priority} onChange={(e) => s('priority', e.target.value)}>{['P0', 'P1', 'P2', 'P3'].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Due"><Input type="date" value={d.dueAt} onChange={(e) => s('dueAt', e.target.value)} /></Field>
      </div>
      {d.column === 'waitingOn' && <Field label="Waiting on"><Input value={d.waitingOn} onChange={(e) => s('waitingOn', e.target.value)} placeholder="who?" /></Field>}
      <Field label="Notes"><Textarea value={d.notes} onChange={(e) => s('notes', e.target.value)} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.syncToReminders} onChange={(e) => s('syncToReminders', e.target.checked)} />Sync to Apple Reminders</label>
      <div className="flex justify-between"><Button type="button" variant="danger" onClick={onDelete}>Delete</Button><Button variant="primary">Save</Button></div>
    </form>
  );
}
function ProjectForm({ project, areas, krs, onSave }: { project: any; areas: any[]; krs: any[]; onSave: (d: any) => void }) {
  const [d, setD] = useState({ name: project.name ?? '', goal: project.goal ?? '', areaId: project.areaId ?? '', status: project.status ?? 'active', nextAction: project.nextAction ?? '', keyResultIds: project.keyResultIds ?? [], isMaintenance: Boolean(project.isMaintenance), notes: project.notes ?? '', trackCosts: Boolean(project.trackCosts) });
  const s = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(d); }}>
      <Field label="Name"><Input value={d.name} onChange={(e) => s('name', e.target.value)} required autoFocus /></Field>
      <Field label="Goal"><Input value={d.goal} onChange={(e) => s('goal', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Area"><Select value={d.areaId} onChange={(e) => s('areaId', e.target.value)}><option value="">—</option>{areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
        <Field label="Status"><Select value={d.status} onChange={(e) => s('status', e.target.value)}>{['active', 'paused', 'done', 'archived'].map((x) => <option key={x}>{x}</option>)}</Select></Field>
      </div>
      <Field label="Next action"><Input value={d.nextAction} onChange={(e) => s('nextAction', e.target.value)} /></Field>
      <Field label="Serves key results" hint={krs.length ? '' : 'No KRs yet — create them in OKRs'}><div className="space-y-1 max-h-40 overflow-y-auto">{krs.map((k) => <label key={k.id} className="flex gap-2 text-sm items-center"><input type="checkbox" checked={d.keyResultIds.includes(k.id)} onChange={(e) => s('keyResultIds', e.target.checked ? [...d.keyResultIds, k.id] : d.keyResultIds.filter((x: string) => x !== k.id))} /><span className="truncate">{k.title}</span></label>)}</div></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.isMaintenance} onChange={(e) => s('isMaintenance', e.target.checked)} />Maintenance (doesn't need an objective)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={d.trackCosts} onChange={(e) => s('trackCosts', e.target.checked)} />Track costs against this project</label>
      <Field label="Notes"><Textarea value={d.notes} onChange={(e) => s('notes', e.target.value)} /></Field>
      <Button variant="primary" className="w-full">Save</Button>
    </form>
  );
}
