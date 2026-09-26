'use client';
import { useEffect, useState } from 'react';
import { where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { create, patch } from '@/lib/db';
import { api, enqueue } from '@/lib/api';
import { H1, Button, Input, Select, Modal, Field, Textarea, Empty, Pill, Card } from '@/components/ui';
import { cn, relTime } from '@/lib/utils';

const fmtSize = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${Math.round(n / 1e3)} KB` : `${n} B`);

export default function Projects() {
  const { user, userDoc } = useAuth(); const uid = user?.uid;
  const projects = useCol<any>(uid, 'projects', [where('status', 'in', ['active', 'paused'])]);
  const runs = useCol<any>(uid, 'projectRuns', [orderBy('at', 'desc'), limit(50)]);
  const [sel, setSel] = useState<string>('inbox');
  const [files, setFiles] = useState<any | null>(null); const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState(''); const [running, setRunning] = useState(false); const [lastRun, setLastRun] = useState<any | null>(null);
  const [newProj, setNewProj] = useState(false);
  const provisioned = Boolean(userDoc?.provisioning?.status === 'ok');
  const current = projects.data.find((p) => p.id === sel);
  const loadFiles = async (id: string) => { setLoading(true); setFiles(null); try { const r = await api('/api/brain', { task: 'project.files', input: { projectId: id } }); setFiles(r.output); } catch (e: any) { setFiles({ error: e.message }); } finally { setLoading(false); } };
  useEffect(() => { if (provisioned) loadFiles(sel); }, [sel, provisioned]);
  const run = async () => { if (!current || !prompt.trim()) return; setRunning(true); setLastRun(null); try { const r = await api('/api/brain', { task: 'project.run', input: { projectId: current.id, prompt } }); setLastRun(r.output); setPrompt(''); loadFiles(current.id); } catch (e: any) { setLastRun({ ok: false, error: e.message }); } finally { setRunning(false); } };
  const move = async (rel: string, toProjectId: string) => { if (!files?.path) return; await api('/api/brain', { task: 'file.move', input: { path: `${files.path}/${rel}`, toProjectId } }); loadFiles(sel); };
  return (
    <div>
      <H1 right={<Button variant="primary" className="text-xs py-1" onClick={() => setNewProj(true)}>+ Project</Button>}>Projects</H1>
      {!provisioned && <Empty>Your Pi workspace isn't provisioned yet — it happens automatically shortly after sign-up. Check the status dot, or ask the admin to re-run provisioning.</Empty>}
      <div className="grid sm:grid-cols-[220px_1fr] gap-4">
        <div className="space-y-1">
          <button onClick={() => setSel('inbox')} className={cn('card w-full text-left px-3 py-2 text-sm', sel === 'inbox' && 'border-[var(--color-accent)]')}>📥 inbox <span className="muted text-xs">uncategorised</span></button>
          {projects.data.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => <button key={p.id} onClick={() => setSel(p.id)} className={cn('card w-full text-left px-3 py-2 text-sm', sel === p.id && 'border-[var(--color-accent)]')}><div className="truncate">{p.name}</div><div className="text-[10px] muted flex gap-2">{p.path ? <span>Pi ✓</span> : <span className="text-red-600">no dir</span>}{p.driveFolderId ? <span>Drive ✓</span> : <span>no Drive</span>}{p.fileCount != null && <span>{p.fileCount} files</span>}</div></button>)}
          {projects.data.some((p) => !p.path || !p.driveFolderId) && <button className="text-xs muted underline px-3" onClick={() => enqueue('project.backfill')}>Provision missing dirs/folders</button>}
        </div>
        <div className="space-y-3 min-w-0">
          {current && <Card className="text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{current.name}</div><div className="text-xs muted">{current.goal}</div></div><div className="text-right text-[11px] muted shrink-0">{current.path && <div><code>{current.path.replace(/^\/home\/[^/]+\//, '~/')}</code></div>}{current.driveFolderId && <a className="underline" href={`https://drive.google.com/drive/folders/${current.driveFolderId}`} target="_blank" rel="noreferrer">open in Drive</a>}{!current.path && <Button className="text-xs py-1 mt-1" onClick={() => enqueue('project.provision', { projectId: current.id })}>Create directory</Button>}</div></div></Card>}
          <Card>
            <div className="flex items-center justify-between mb-2"><div className="text-xs font-medium">Files {files?.path && <span className="muted font-normal">· {files.files?.length ?? 0}</span>}</div><button className="text-xs muted underline" onClick={() => loadFiles(sel)}>refresh</button></div>
            {loading ? <div className="text-xs muted">Reading from the Pi…</div> : files?.error ? <div className="text-xs text-red-600">{files.error}</div> : !files?.files?.length ? <div className="text-xs muted">{files?.note ?? 'Empty. Drop files into the Drive folder — they arrive within 15 minutes — or let the agent create some.'}</div> : (
              <div className="divide-y text-sm">{files.files.map((f: any) => <div key={f.rel} className="flex items-center gap-2 py-1.5"><span className="truncate flex-1">{f.rel}</span><span className="text-[10px] muted w-14 text-right">{fmtSize(f.size)}</span><span className="text-[10px] muted w-10 text-right">{relTime(f.mtime)}</span>{f.driveFileId ? <a className="text-[10px] underline muted" href={`https://drive.google.com/file/d/${f.driveFileId}/view`} target="_blank" rel="noreferrer">Drive</a> : <span className="text-[10px] muted">local</span>}<Select className="!w-32 py-0.5 text-xs" value="" onChange={(e) => e.target.value && move(f.rel, e.target.value)}><option value="">Move to…</option>{sel !== 'inbox' && <option value="inbox">inbox</option>}{projects.data.filter((p) => p.id !== sel && p.path).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></div>)}</div>
            )}
          </Card>
          {current?.path && <Card>
            <div className="text-xs font-medium mb-2">Run Claude in this project <span className="muted font-normal">· cwd = project dir · resumes the project's session</span></div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}><Input placeholder="e.g. Summarise every document here into README.md" value={prompt} onChange={(e) => setPrompt(e.target.value)} disabled={running} /><Button variant="primary" disabled={running || !prompt.trim()}>{running ? 'Running…' : 'Run'}</Button></form>
            {lastRun && <div className={cn('mt-3 text-sm whitespace-pre-wrap', !lastRun.ok && 'text-red-600')}>{lastRun.result ?? lastRun.error}{lastRun.filesChanged?.length > 0 && <div className="text-xs muted mt-1">changed: {lastRun.filesChanged.join(', ')}</div>}</div>}
            <div className="mt-3 space-y-1">{runs.data.filter((r) => r.projectId === current.id).slice(0, 5).map((r) => <div key={r.id} className="text-xs flex gap-2"><span className="muted w-10 shrink-0">{relTime(r.at)}</span><Pill className={r.status === 'ok' ? '' : 'p1'}>{r.status}</Pill><span className="truncate">{r.prompt}</span><span className="muted ml-auto shrink-0">${(r.costUsd ?? 0).toFixed(2)}</span></div>)}</div>
          </Card>}
        </div>
      </div>
      <Modal open={newProj} onClose={() => setNewProj(false)} title="New project"><NewProject onSave={async (d) => { const ref = await create(uid!, 'projects', { ...d, status: 'active', keyResultIds: [], isMaintenance: false, order: Date.now() }); enqueue('project.provision', { projectId: ref.id }).catch(() => {}); setNewProj(false); setSel(ref.id); }} /></Modal>
    </div>
  );
}
function NewProject({ onSave }: { onSave: (d: any) => void }) {
  const [d, setD] = useState({ name: '', goal: '' });
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(d); }}><Field label="Name"><Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} required autoFocus /></Field><Field label="Goal"><Textarea value={d.goal} onChange={(e) => setD({ ...d, goal: e.target.value })} /></Field><p className="text-xs muted">Creates a directory in your Pi workspace and a folder in your Drive space; link it to a key result on the Board.</p><Button variant="primary" className="w-full">Create</Button></form>;
}
