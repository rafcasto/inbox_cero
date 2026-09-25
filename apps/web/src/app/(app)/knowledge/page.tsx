'use client';
import { useMemo, useState } from 'react';
import { orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { remove } from '@/lib/db';
import { api } from '@/lib/api';
import { H1, Button, Input, Modal, Field, Textarea, Empty, Pill } from '@/components/ui';
import { relTime } from '@/lib/utils';

export default function Knowledge() {
  const { user } = useAuth(); const uid = user?.uid;
  const docs = useCol<any>(uid, 'knowledge', [orderBy('updatedAt', 'desc'), limit(500)]);
  const [q, setQ] = useState(''); const [open, setOpen] = useState<any | null>(null); const [adding, setAdding] = useState(false);
  const results = useMemo(() => { const terms = q.toLowerCase().split(/\s+/).filter(Boolean); if (!terms.length) return docs.data; return docs.data.map((d) => ({ d, score: terms.reduce((s, t) => s + (d.title?.toLowerCase().includes(t) ? 3 : 0) + ((d.keywords ?? []).some((k: string) => k.includes(t)) ? 2 : 0) + ((d.tags ?? []).some((k: string) => k.includes(t)) ? 2 : 0) + (d.body?.toLowerCase().includes(t) ? 1 : 0), 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.d); }, [docs.data, q]);
  return (
    <div>
      <H1 right={<Button className="text-xs py-1" onClick={() => setAdding(true)}>+ Note</Button>}>Knowledge <span className="muted text-base font-normal">{docs.data.length}</span></H1>
      <Input placeholder="Search titles, tags, keywords…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-4" autoFocus />
      {results.length === 0 ? <Empty>{docs.data.length === 0 ? 'Empty. Add notes here, or index a markdown repo on the Pi: pnpm --filter @atlas/brain exec tsx scripts/index-knowledge.ts <uid> <dir>' : 'No matches.'}</Empty> : <div className="grid sm:grid-cols-2 gap-2">{results.map((d) => <button key={d.id} onClick={() => setOpen(d)} className="card p-3 text-left"><div className="text-sm font-medium truncate">{d.title}</div><div className="text-xs muted line-clamp-2 mt-0.5">{d.excerpt}</div><div className="flex gap-1 mt-2 flex-wrap">{(d.tags ?? []).slice(0, 4).map((t: string) => <Pill key={t}>{t}</Pill>)}<span className="text-[10px] muted ml-auto">{d.source} · {relTime(d.updatedAt)}</span></div></button>)}</div>}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title ?? ''}>{open && <div className="space-y-3 text-sm"><div className="flex gap-1 flex-wrap">{(open.keywords ?? open.tags ?? []).map((t: string) => <Pill key={t}>{t}</Pill>)}</div><pre className="whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">{open.body}</pre><div className="flex justify-between"><Button variant="danger" onClick={async () => { await remove(uid!, 'knowledge', open.id); setOpen(null); }}>Delete</Button><Button onClick={() => navigator.clipboard.writeText(open.body)}>Copy</Button></div></div>}</Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title="New note"><NoteForm onSave={async (d) => { await api('/api/knowledge', d); setAdding(false); }} /></Modal>
    </div>
  );
}
function NoteForm({ onSave }: { onSave: (d: any) => Promise<void> }) {
  const [d, setD] = useState({ title: '', body: '', tags: '' }); const [busy, setBusy] = useState(false);
  return <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSave({ title: d.title, body: d.body, tags: d.tags.split(',').map((s) => s.trim()).filter(Boolean) }); } finally { setBusy(false); } }}><Field label="Title"><Input value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} required autoFocus /></Field><Field label="Tags" hint="comma separated"><Input value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></Field><Field label="Body (markdown)"><Textarea className="min-h-48" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} required /></Field><Button variant="primary" className="w-full" disabled={busy}>Save & index</Button></form>;
}
