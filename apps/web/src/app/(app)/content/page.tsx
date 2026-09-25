'use client';
import { useState } from 'react';
import { where, orderBy, limit } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { create, patch, remove, nowIso } from '@/lib/db';
import { enqueue } from '@/lib/api';
import { H1, Button, Input, Select, Modal, Field, Textarea, Empty, Pill } from '@/components/ui';
import { cn, relTime } from '@/lib/utils';

const STAGES = [['idea', 'Idea'], ['draft', 'Draft'], ['review', 'Review'], ['scheduled', 'Scheduled'], ['published', 'Published']] as const;
const PLATFORMS = ['linkedin', 'x', 'instagram', 'newsletter'] as const;

export default function ContentPage() {
  const { user } = useAuth(); const uid = user?.uid;
  const content = useCol<any>(uid, 'content', [orderBy('updatedAt', 'desc'), limit(200)]);
  const seeds = useCol<any>(uid, 'items', [where('tags', 'array-contains', 'content-seed'), limit(20)]);
  const metrics = useCol<any>(uid, 'contentMetrics', [orderBy('date', 'desc'), limit(60)]);
  const [open, setOpen] = useState<any | null>(null);
  const [metricModal, setMetricModal] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(['linkedin']);
  const [idea, setIdea] = useState('');
  const addIdea = async () => { if (!uid || !idea.trim()) return; await create(uid, 'content', { platform: platforms[0] ?? 'linkedin', stage: 'idea', title: idea.trim().slice(0, 80), body: idea.trim(), seeds: [] }); setIdea(''); };
  const draft = async (c: any) => { await enqueue('content.draft', { platforms: [c.platform], contentId: c.id, seeds: c.seeds?.length ? c.seeds : [{ type: 'manual', text: c.body || c.title }] }); };
  const latest = (p: string) => metrics.data.find((m) => m.platform === p);
  return (
    <div>
      <H1 right={<div className="flex gap-2"><Button className="text-xs py-1" onClick={() => setMetricModal(true)}>+ Metrics</Button></div>}>Content</H1>
      <div className="grid grid-cols-4 gap-2 mb-4">{PLATFORMS.map((p) => { const m = latest(p); return <div key={p} className="card p-2 text-center"><div className="text-[10px] muted uppercase">{p}</div><div className="text-sm font-semibold">{m?.followers ?? '–'}</div><div className="text-[10px] muted">{m ? `${m.impressions ?? 0} impr · ${relTime(m.date)}` : 'no data'}</div></div>; })}</div>
      <form className="flex gap-2 mb-2" onSubmit={(e) => { e.preventDefault(); addIdea(); }}><Input placeholder="New idea…" value={idea} onChange={(e) => setIdea(e.target.value)} /><Select value={platforms[0]} onChange={(e) => setPlatforms([e.target.value])} className="!w-auto">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select><Button variant="primary">Add</Button></form>
      {seeds.data.length > 0 && <div className="flex gap-2 overflow-x-auto mb-4 pb-1">{seeds.data.map((s) => <button key={s.id} className="card px-3 py-1.5 text-xs shrink-0 max-w-64 truncate" title={s.summary} onClick={() => create(uid!, 'content', { platform: 'linkedin', stage: 'idea', title: (s.summary || s.raw?.subject || '').slice(0, 80), body: s.summary, seeds: [{ type: 'item', refId: s.id }] })}>🌱 {s.summary || s.raw?.subject}</button>)}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {STAGES.map(([id, label]) => (
          <div key={id} className="rounded-[10px] p-2 min-h-24" style={{ background: 'color-mix(in srgb, var(--color-line) 40%, transparent)' }}>
            <div className="text-xs font-medium muted px-1 mb-2">{label}</div>
            <div className="space-y-1.5">{content.data.filter((c) => c.stage === id).map((c) => <div key={c.id} onClick={() => setOpen(c)} className="card p-2.5 text-sm cursor-pointer"><div className="truncate">{c.title || c.body?.slice(0, 60)}</div><div className="flex justify-between text-[10px] muted mt-1"><Pill>{c.platform}</Pill><span>{relTime(c.updatedAt)}</span></div></div>)}</div>
          </div>
        ))}
      </div>
      {content.data.length === 0 && <div className="mt-4"><Empty>Capture ideas here, from WhatsApp ("idea …") or from reminders. Drafts are generated in your voice; nothing is ever auto-published.</Empty></div>}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title || 'Content'}>{open && <ContentForm c={open} onSave={async (d) => { await patch(uid!, 'content', open.id, d); setOpen(null); }} onDraft={() => { draft(open); setOpen(null); }} onDelete={async () => { await remove(uid!, 'content', open.id); setOpen(null); }} />}</Modal>
      <Modal open={metricModal} onClose={() => setMetricModal(false)} title="Record metrics"><MetricForm onSave={async (d) => { await create(uid!, 'contentMetrics', d); setMetricModal(false); }} /></Modal>
    </div>
  );
}
function ContentForm({ c, onSave, onDraft, onDelete }: { c: any; onSave: (d: any) => void; onDraft: () => void; onDelete: () => void }) {
  const [d, setD] = useState({ title: c.title ?? '', body: c.body ?? '', platform: c.platform, stage: c.stage, scheduledFor: c.scheduledFor?.slice(0, 16) ?? '', publishedUrl: c.publishedUrl ?? '' });
  const s = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, scheduledFor: d.scheduledFor ? new Date(d.scheduledFor).toISOString() : null, publishedAt: d.stage === 'published' ? (c.publishedAt ?? nowIso()) : null }); }}>
      {c.hook && <div className="text-xs muted">Hook: {c.hook} · {c.why}</div>}
      <div className="grid grid-cols-2 gap-2"><Field label="Platform"><Select value={d.platform} onChange={(e) => s('platform', e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field><Field label="Stage"><Select value={d.stage} onChange={(e) => s('stage', e.target.value)}>{STAGES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select></Field></div>
      <Field label="Title"><Input value={d.title} onChange={(e) => s('title', e.target.value)} /></Field>
      <Field label="Body"><Textarea className="min-h-48 font-sans" value={d.body} onChange={(e) => s('body', e.target.value)} /></Field>
      {d.stage === 'scheduled' && <Field label="Scheduled for"><Input type="datetime-local" value={d.scheduledFor} onChange={(e) => s('scheduledFor', e.target.value)} /></Field>}
      {d.stage === 'published' && <Field label="Published URL"><Input value={d.publishedUrl} onChange={(e) => s('publishedUrl', e.target.value)} /></Field>}
      <div className="flex justify-between gap-2"><Button type="button" variant="danger" onClick={onDelete}>Delete</Button><div className="flex gap-2"><Button type="button" onClick={() => navigator.clipboard.writeText(d.body)}>Copy</Button><Button type="button" onClick={onDraft}>{c.stage === 'idea' ? 'Draft it' : 'Redraft'}</Button><Button variant="primary">Save</Button></div></div>
    </form>
  );
}
function MetricForm({ onSave }: { onSave: (d: any) => void }) {
  const [d, setD] = useState({ platform: 'linkedin', date: new Date().toISOString().slice(0, 10), followers: '', impressions: '', engagement: '' });
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, followers: Number(d.followers) || 0, impressions: Number(d.impressions) || 0, engagement: Number(d.engagement) || 0, source: 'manual' }); }}><div className="grid grid-cols-2 gap-2"><Field label="Platform"><Select value={d.platform} onChange={(e) => setD({ ...d, platform: e.target.value })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field><Field label="Date"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field><Field label="Followers / subscribers"><Input type="number" value={d.followers} onChange={(e) => setD({ ...d, followers: e.target.value })} /></Field><Field label="Impressions (7d)"><Input type="number" value={d.impressions} onChange={(e) => setD({ ...d, impressions: e.target.value })} /></Field><Field label="Engagements (7d)"><Input type="number" value={d.engagement} onChange={(e) => setD({ ...d, engagement: e.target.value })} /></Field></div><Button variant="primary" className="w-full">Save</Button></form>;
}
