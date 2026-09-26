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
  const projects = useCol<any>(uid, 'projects', [where('status', 'in', ['active', 'paused'])]);
  const integrations = useCol<any>(uid, 'integrations');
  const [projFilter, setProjFilter] = useState('');
  const hasLinkedIn = integrations.data.some((i) => i.type === 'linkedin'); const hasKit = integrations.data.some((i) => i.type === 'kit');
  const [open, setOpen] = useState<any | null>(null);
  const [metricModal, setMetricModal] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>(['linkedin']);
  const [idea, setIdea] = useState('');
  const addIdea = async () => { if (!uid || !idea.trim()) return; await create(uid, 'content', { platform: platforms[0] ?? 'linkedin', stage: 'idea', title: idea.trim().slice(0, 80), body: idea.trim(), seeds: [] }); setIdea(''); };
  const draft = async (c: any) => { await enqueue('content.draft', { platforms: [c.platform], contentId: c.id, seeds: c.seeds?.length ? c.seeds : [{ type: 'manual', text: c.body || c.title }] }); };
  const latest = (p: string) => metrics.data.find((m) => m.platform === p);
  return (
    <div>
      <H1 right={<div className="flex gap-2"><Select className="!w-auto text-xs py-1" value={projFilter} onChange={(e) => setProjFilter(e.target.value)}><option value="">All projects</option>{projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><Button className="text-xs py-1" onClick={() => setMetricModal(true)}>+ Metrics</Button></div>}>Content</H1>
      <div className="grid grid-cols-4 gap-2 mb-4">{PLATFORMS.map((p) => { const m = latest(p); return <div key={p} className="card p-2 text-center"><div className="text-[10px] muted uppercase">{p}</div><div className="text-sm font-semibold">{m?.followers ?? '–'}</div><div className="text-[10px] muted">{m ? `${m.impressions ?? 0} impr · ${relTime(m.date)}` : 'no data'}</div></div>; })}</div>
      <form className="flex gap-2 mb-2" onSubmit={(e) => { e.preventDefault(); addIdea(); }}><Input placeholder="New idea…" value={idea} onChange={(e) => setIdea(e.target.value)} /><Select value={platforms[0]} onChange={(e) => setPlatforms([e.target.value])} className="!w-auto">{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select><Button variant="primary">Add</Button></form>
      {seeds.data.length > 0 && <div className="flex gap-2 overflow-x-auto mb-4 pb-1">{seeds.data.map((s) => <button key={s.id} className="card px-3 py-1.5 text-xs shrink-0 max-w-64 truncate" title={s.summary} onClick={() => create(uid!, 'content', { platform: 'linkedin', stage: 'idea', title: (s.summary || s.raw?.subject || '').slice(0, 80), body: s.summary, seeds: [{ type: 'item', refId: s.id }] })}>🌱 {s.summary || s.raw?.subject}</button>)}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {STAGES.map(([id, label]) => (
          <div key={id} className="rounded-[10px] p-2 min-h-24" style={{ background: 'color-mix(in srgb, var(--color-line) 40%, transparent)' }}>
            <div className="text-xs font-medium muted px-1 mb-2">{label}</div>
            <div className="space-y-1.5">{content.data.filter((c) => c.stage === id && (!projFilter || c.projectId === projFilter)).map((c) => <div key={c.id} onClick={() => setOpen(c)} className="card p-2.5 text-sm cursor-pointer"><div className="truncate">{c.title || c.body?.slice(0, 60)}</div><div className="flex justify-between text-[10px] muted mt-1 gap-1"><Pill>{c.platform}</Pill>{c.publishedTo?.length > 0 && <span>{c.publishedTo.map((p: any) => p.channel).join('+')}</span>}<span className="ml-auto">{relTime(c.updatedAt)}</span></div></div>)}</div>
          </div>
        ))}
      </div>
      {content.data.length === 0 && <div className="mt-4"><Empty>Capture ideas here, from WhatsApp ("idea …") or from reminders. Drafts are generated in your voice; nothing is ever auto-published.</Empty></div>}
      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.title || 'Content'}>{open && <ContentForm c={open} projects={projects.data} hasLinkedIn={hasLinkedIn} hasKit={hasKit} onSave={async (d) => { await patch(uid!, 'content', open.id, d); setOpen(null); }} onDraft={() => { draft(open); setOpen(null); }} onDelete={async () => { await remove(uid!, 'content', open.id); setOpen(null); }} onPublish={async (channel) => { if (!confirm(channel === 'linkedin' ? 'Publish this to LinkedIn now? This is public and immediate.' : 'Create a draft broadcast in Kit?')) return; await patch(uid!, 'content', open.id, { versions: [...(open.versions ?? []), { at: nowIso(), stage: open.stage, title: open.title ?? '', body: open.body ?? '', note: `before ${channel}` }].slice(-20) }); await enqueue(channel === 'linkedin' ? 'linkedin.publish' : 'newsletter.publish', { contentId: open.id }); setOpen(null); }} />}</Modal>
      <Modal open={metricModal} onClose={() => setMetricModal(false)} title="Record metrics"><MetricForm onSave={async (d) => { await create(uid!, 'contentMetrics', d); setMetricModal(false); }} /></Modal>
    </div>
  );
}
function ContentForm({ c, projects, hasLinkedIn, hasKit, onSave, onDraft, onDelete, onPublish }: { c: any; projects: any[]; hasLinkedIn: boolean; hasKit: boolean; onSave: (d: any) => void; onDraft: () => void; onDelete: () => void; onPublish: (channel: 'linkedin' | 'kit') => void }) {
  const [d, setD] = useState({ title: c.title ?? '', body: c.body ?? '', platform: c.platform, stage: c.stage, scheduledFor: c.scheduledFor?.slice(0, 16) ?? '', publishedUrl: c.publishedUrl ?? '', projectId: c.projectId ?? '' });
  const s = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, projectId: d.projectId || null, scheduledFor: d.scheduledFor ? new Date(d.scheduledFor).toISOString() : null, publishedAt: d.stage === 'published' ? (c.publishedAt ?? nowIso()) : null }); }}>
      {c.hook && <div className="text-xs muted">Hook: {c.hook} · {c.why}</div>}
      <div className="grid grid-cols-3 gap-2"><Field label="Platform"><Select value={d.platform} onChange={(e) => s('platform', e.target.value)}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field><Field label="Stage"><Select value={d.stage} onChange={(e) => s('stage', e.target.value)}>{STAGES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</Select></Field><Field label="Project"><Select value={d.projectId} onChange={(e) => s('projectId', e.target.value)}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field></div>
      {c.publishedTo?.length > 0 && <div className="text-xs flex flex-wrap gap-2">{c.publishedTo.map((p: any, i: number) => <a key={i} className="pill" href={p.url ?? '#'} target="_blank" rel="noreferrer">{p.channel} · {p.status} · {relTime(p.at)}</a>)}</div>}
      {c.metrics && <div className="text-xs muted">{c.metrics.impressions ?? 0} impressions · {c.metrics.likes ?? 0} reactions · {c.metrics.comments ?? 0} comments · {c.metrics.shares ?? 0} reposts</div>}
      {c.versions?.length > 0 && <details className="text-xs"><summary className="muted cursor-pointer">{c.versions.length} version(s)</summary>{c.versions.slice().reverse().map((v: any, i: number) => <div key={i} className="mt-1 card p-2"><div className="muted">{relTime(v.at)} · {v.stage}{v.note ? ` · ${v.note}` : ''}</div><div className="truncate">{v.title || v.body?.slice(0, 80)}</div></div>)}</details>}
      <Field label="Title"><Input value={d.title} onChange={(e) => s('title', e.target.value)} /></Field>
      <Field label="Body"><Textarea className="min-h-48 font-sans" value={d.body} onChange={(e) => s('body', e.target.value)} /></Field>
      {d.stage === 'scheduled' && <Field label="Scheduled for"><Input type="datetime-local" value={d.scheduledFor} onChange={(e) => s('scheduledFor', e.target.value)} /></Field>}
      {d.stage === 'published' && <Field label="Published URL"><Input value={d.publishedUrl} onChange={(e) => s('publishedUrl', e.target.value)} /></Field>}
      <div className="flex justify-between gap-2 flex-wrap"><Button type="button" variant="danger" onClick={onDelete}>Delete</Button><div className="flex gap-2 flex-wrap"><Button type="button" onClick={() => navigator.clipboard.writeText(d.body)}>Copy</Button><Button type="button" onClick={onDraft}>{c.stage === 'idea' ? 'Draft it' : 'Redraft'}</Button>{(d.stage === 'review' || d.stage === 'scheduled') && d.platform === 'linkedin' && <Button type="button" disabled={!hasLinkedIn} title={hasLinkedIn ? '' : 'Connect LinkedIn in Settings'} onClick={() => onPublish('linkedin')}>Publish to LinkedIn</Button>}{(d.stage === 'review' || d.stage === 'scheduled') && d.platform === 'newsletter' && <Button type="button" disabled={!hasKit} title={hasKit ? '' : 'Add your Kit API key in Settings'} onClick={() => onPublish('kit')}>Create Kit draft</Button>}<Button variant="primary">Save</Button></div></div>
    </form>
  );
}
function MetricForm({ onSave }: { onSave: (d: any) => void }) {
  const [d, setD] = useState({ platform: 'linkedin', date: new Date().toISOString().slice(0, 10), followers: '', impressions: '', engagement: '' });
  return <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave({ ...d, followers: Number(d.followers) || 0, impressions: Number(d.impressions) || 0, engagement: Number(d.engagement) || 0, source: 'manual' }); }}><div className="grid grid-cols-2 gap-2"><Field label="Platform"><Select value={d.platform} onChange={(e) => setD({ ...d, platform: e.target.value })}>{PLATFORMS.map((p) => <option key={p}>{p}</option>)}</Select></Field><Field label="Date"><Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field><Field label="Followers / subscribers"><Input type="number" value={d.followers} onChange={(e) => setD({ ...d, followers: e.target.value })} /></Field><Field label="Impressions (7d)"><Input type="number" value={d.impressions} onChange={(e) => setD({ ...d, impressions: e.target.value })} /></Field><Field label="Engagements (7d)"><Input type="number" value={d.engagement} onChange={(e) => setD({ ...d, engagement: e.target.value })} /></Field></div><Button variant="primary" className="w-full">Save</Button></form>;
}
