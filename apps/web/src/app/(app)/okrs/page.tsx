'use client';
import { useState } from 'react';
import { where, orderBy, limit } from 'firebase/firestore';
import { krProgress } from '@atlas/schemas';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { create, patch, remove, nowIso } from '@/lib/db';
import { enqueue, api } from '@/lib/api';
import { H1, Button, Input, Select, Modal, Field, Textarea, Progress, Empty, Card, Pill } from '@/components/ui';
import { quarterOf, relTime } from '@/lib/utils';

export default function OKRs() {
  const { user, profile } = useAuth(); const uid = user?.uid;
  const q = quarterOf(new Date(), profile.okr.quarterStart);
  const objectives = useCol<any>(uid, 'objectives', [where('status', '==', 'active')]);
  const krs = useCol<any>(uid, 'keyResults');
  const updates = useCol<any>(uid, 'krUpdates', [orderBy('at', 'desc'), limit(200)]);
  const projects = useCol<any>(uid, 'projects', [where('status', '==', 'active')]);
  const sessions = useCol<any>(uid, 'sessions', [orderBy('createdAt', 'desc'), limit(10)]);
  const [objModal, setObjModal] = useState<any | null>(null);
  const [krModal, setKrModal] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const spark = (krId: string) => updates.data.filter((u) => u.keyResultId === krId && u.confidence != null).slice(0, 8).reverse().map((u) => u.confidence);
  const startSession = async (type: string) => { setBusy(true); try { const r = await api('/api/brain', { task: 'session.prep', input: { type, channel: 'portal' } }); const s = { id: r.output.sessionId, type, prep: r.output.prep, transcript: [] }; setSession(s); } finally { setBusy(false); } };
  const send = async () => { if (!session || !msg.trim()) return; setBusy(true); const m = msg; setMsg(''); setSession((s: any) => ({ ...s, transcript: [...s.transcript, { role: 'user', content: m }] })); try { const r = await api('/api/brain', { task: 'session.turn', input: { sessionId: session.id, message: m, via: 'portal' } }); setSession((s: any) => ({ ...s, transcript: [...s.transcript, { role: 'coach', content: r.output.reply }], done: r.output.done })); } finally { setBusy(false); } };
  const openSession = sessions.data.find((s) => s.status === 'inProgress' || s.status === 'prepared');
  return (
    <div>
      <H1 right={<div className="flex gap-2"><Button className="text-xs py-1" disabled={busy} onClick={() => startSession('daily')}>Daily check-in</Button><Button className="text-xs py-1" disabled={busy} onClick={() => startSession('weekly')}>Weekly truth</Button><Button className="text-xs py-1" disabled={busy} onClick={() => startSession(objectives.data.length ? 'monthly' : 'quarterlyPlan')}>{objectives.data.length ? 'Monthly review' : 'Plan quarter'}</Button><Button variant="primary" className="text-xs py-1" onClick={() => setObjModal({})}>+ Objective</Button></div>}>OKRs <span className="muted text-base font-normal">{q}</span></H1>
      {openSession && !session && <button className="card p-3 w-full text-left text-sm mb-4 flex justify-between" onClick={() => setSession({ ...openSession, transcript: openSession.transcript ?? [] })}><span>▶ Resume {openSession.type} session</span><span className="muted">{relTime(openSession.createdAt)}</span></button>}
      {objectives.data.length === 0 ? <Empty>No objectives this quarter. Add one, or run &ldquo;Plan quarter&rdquo; and let your Chief of Staff propose them.</Empty> : (
        <div className="space-y-4">
          {objectives.data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((o) => {
            const ks = krs.data.filter((k) => k.objectiveId === o.id);
            const prog = ks.length ? ks.reduce((a, k) => a + krProgress(k), 0) / ks.length : 0;
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-3 mb-3"><button className="text-left" onClick={() => setObjModal(o)}><div className="font-medium">{o.title}</div>{o.description && <div className="text-xs muted">{o.description}</div>}</button><div className="text-right shrink-0"><div className="text-lg font-semibold">{Math.round(prog * 100)}%</div><button className="text-xs muted underline" onClick={() => setKrModal({ objectiveId: o.id })}>+ KR</button></div></div>
                <div className="space-y-3">
                  {ks.map((k) => {
                    const linked = projects.data.filter((p) => p.keyResultIds?.includes(k.id));
                    return (
                      <div key={k.id} className="cursor-pointer" onClick={() => setKrModal(k)}>
                        <div className="flex justify-between text-sm gap-2"><span className="truncate">{k.title}</span><span className="muted shrink-0">{k.current}{k.unit ? ' ' + k.unit : ''} / {k.target}</span></div>
                        <Progress value={krProgress(k)} className="my-1" />
                        <div className="flex items-center gap-2 text-[10px] muted"><span>confidence {k.confidence}/10</span><Spark v={spark(k.id)} />{k.autoSource && k.autoSource.type !== 'manual' && <Pill>auto</Pill>}<span className="truncate">{linked.map((p) => p.name).join(', ') || 'no linked projects'}</span><span className="ml-auto shrink-0">{relTime(k.updatedAt)}</span></div>
                      </div>
                    );
                  })}
                  {ks.length === 0 && <div className="text-xs p1 pill">No measurable key results yet</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <section className="mt-8"><h2 className="text-sm font-medium mb-2">Sessions</h2>{sessions.data.length === 0 ? <div className="text-xs muted">None yet. Weekly truth session runs {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][profile.okr.weekly.day]} {profile.okr.weekly.time} via {profile.okr.channel}.</div> : sessions.data.map((s) => <div key={s.id} className="text-xs flex gap-2 py-1"><span className="muted w-10 shrink-0">{relTime(s.createdAt)}</span><span className="w-20 shrink-0">{s.type}</span><span className="truncate">{s.summary || s.prep?.headline || s.status}</span></div>)}</section>

      <Modal open={Boolean(objModal)} onClose={() => setObjModal(null)} title={objModal?.id ? 'Objective' : 'New objective'}>{objModal && <ObjForm o={objModal} q={q} onSave={async (d) => { if (objModal.id) await patch(uid!, 'objectives', objModal.id, d); else await create(uid!, 'objectives', { ...d, status: 'active', order: Date.now() }); setObjModal(null); }} onDrop={async () => { await patch(uid!, 'objectives', objModal.id, { status: 'dropped' }); setObjModal(null); }} />}</Modal>
      <Modal open={Boolean(krModal)} onClose={() => setKrModal(null)} title={krModal?.id ? 'Key result' : 'New key result'}>{krModal && <KrForm k={krModal} onSave={async (d, note) => { const prev = krModal.current; if (krModal.id) { await patch(uid!, 'keyResults', krModal.id, d); if (d.current !== prev || note) await create(uid!, 'krUpdates', { keyResultId: krModal.id, value: d.current, confidence: d.confidence, source: 'manual', note, at: nowIso() }); } else { const ref = await create(uid!, 'keyResults', d); await create(uid!, 'krUpdates', { keyResultId: ref.id, value: d.current, confidence: d.confidence, source: 'manual', note: 'created', at: nowIso() }); } setKrModal(null); enqueue('governance.flags').catch(() => {}); }} onDelete={async () => { await remove(uid!, 'keyResults', krModal.id); setKrModal(null); }} />}</Modal>
      <Modal open={Boolean(session)} onClose={() => setSession(null)} title={`${session?.type ?? ''} session`}>
        {session && <div className="space-y-3 text-sm">
          {session.prep && <div className="card p-3 text-xs space-y-2"><div className="font-medium">{session.prep.headline}</div><div className="whitespace-pre-wrap">{session.prep.brief}</div>{session.prep.proposedFocus?.length > 0 && <div><div className="muted mb-1">Proposed focus</div>{session.prep.proposedFocus.map((f: any, i: number) => <div key={i}>• {f.title} <span className="muted">— {f.why}</span></div>)}</div>}{session.prep.questions?.length > 0 && <div><div className="muted mb-1">Questions</div>{session.prep.questions.map((x: string, i: number) => <div key={i}>{i + 1}. {x}</div>)}</div>}</div>}
          <div className="space-y-2 max-h-64 overflow-y-auto">{session.transcript.map((t: any, i: number) => <div key={i} className={t.role === 'user' ? 'text-right' : ''}><span className={`inline-block rounded-[10px] px-3 py-1.5 ${t.role === 'user' ? 'bg-[var(--color-accent)] text-white' : 'card'}`}>{t.content}</span></div>)}</div>
          {session.done ? <div className="text-xs muted">Session closed. Decisions and tasks were recorded.</div> : <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}><Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Answer…" autoFocus disabled={busy} /><Button variant="primary" disabled={busy}>Send</Button></form>}
        </div>}
      </Modal>
    </div>
  );
}
function Spark({ v }: { v: number[] }) { if (v.length < 2) return null; const w = 40, h = 12; const pts = v.map((x, i) => `${(i / (v.length - 1)) * w},${h - (x / 10) * h}`).join(' '); return <svg width={w} height={h} className="shrink-0"><polyline points={pts} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" /></svg>; }
function ObjForm({ o, q, onSave, onDrop }: { o: any; q: string; onSave: (d: any) => void; onDrop: () => void }) {
  const [d, setD] = useState({ title: o.title ?? '', description: o.description ?? '', quarter: o.quarter ?? q });
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(d); }}><Field label="Objective"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required autoFocus /></Field><Field label="Why it matters"><Textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></Field><Field label="Quarter"><Input value={d.quarter} onChange={(e) => setD({ ...d, quarter: e.target.value })} pattern="\d{4}-Q[1-4]" /></Field><div className="flex justify-between">{o.id ? <Button type="button" variant="danger" onClick={onDrop}>Drop</Button> : <span />}<Button variant="primary">Save</Button></div></form>;
}
function KrForm({ k, onSave, onDelete }: { k: any; onSave: (d: any, note: string) => void; onDelete: () => void }) {
  const [d, setD] = useState({ objectiveId: k.objectiveId, title: k.title ?? '', metric: k.metric ?? '', unit: k.unit ?? '', baseline: k.baseline ?? 0, target: k.target ?? 100, current: k.current ?? k.baseline ?? 0, direction: k.direction ?? 'up', confidence: k.confidence ?? 5, autoSource: k.autoSource ?? { type: 'manual', config: {} } });
  const [note, setNote] = useState('');
  const s = (key: string, v: unknown) => setD((x) => ({ ...x, [key]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, baseline: Number(d.baseline), target: Number(d.target), current: Number(d.current), confidence: Number(d.confidence), updatedAt: nowIso() }, note); }}>
      <Field label="Key result" hint="measurable: from X to Y by end of quarter"><Input value={d.title} onChange={(e) => s('title', e.target.value)} required autoFocus /></Field>
      <div className="grid grid-cols-3 gap-2"><Field label="Baseline"><Input type="number" step="any" value={d.baseline} onChange={(e) => s('baseline', e.target.value)} /></Field><Field label="Current"><Input type="number" step="any" value={d.current} onChange={(e) => s('current', e.target.value)} /></Field><Field label="Target"><Input type="number" step="any" value={d.target} onChange={(e) => s('target', e.target.value)} /></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Unit"><Input value={d.unit} onChange={(e) => s('unit', e.target.value)} placeholder="subs, $, %" /></Field><Field label={`Confidence ${d.confidence}/10`}><input type="range" min={0} max={10} value={d.confidence} onChange={(e) => s('confidence', e.target.value)} className="w-full accent-[var(--color-accent)]" /></Field></div>
      <Field label="Auto-update from"><Select value={d.autoSource.type} onChange={(e) => s('autoSource', { type: e.target.value, config: {} })}><option value="manual">manual</option><option value="ledgerCategoryTotal">ledger: monthly spend in a category</option><option value="tasksCompleted">tasks completed</option><option value="contentPublished">content published</option></Select></Field>
      {d.autoSource.type === 'ledgerCategoryTotal' && <Field label="Category id" hint="e.g. software; blank = total spend"><Input value={d.autoSource.config.categoryId ?? ''} onChange={(e) => s('autoSource', { ...d.autoSource, config: { categoryId: e.target.value } })} /></Field>}
      {d.autoSource.type === 'contentPublished' && <Field label="Platform"><Select value={d.autoSource.config.platform ?? ''} onChange={(e) => s('autoSource', { ...d.autoSource, config: { platform: e.target.value } })}><option value="">any</option>{['linkedin', 'x', 'instagram', 'newsletter'].map((p) => <option key={p}>{p}</option>)}</Select></Field>}
      {k.id && <Field label="Update note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="what changed?" /></Field>}
      <div className="flex justify-between">{k.id ? <Button type="button" variant="danger" onClick={onDelete}>Delete</Button> : <span />}<Button variant="primary">Save</Button></div>
    </form>
  );
}
