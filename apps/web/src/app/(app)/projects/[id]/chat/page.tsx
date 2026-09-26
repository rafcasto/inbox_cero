'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { where, orderBy, limit, collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { useAuth } from '@/lib/auth';
import { useCol, useSubCol, useDoc } from '@/lib/hooks';
import { enqueue } from '@/lib/api';
import { Button, Textarea, Pill } from '@/components/ui';
import { cn, relTime } from '@/lib/utils';

export default function ProjectChat() {
  const { user } = useAuth(); const uid = user?.uid;
  const { id: projectId } = useParams<{ id: string }>();
  const sp = useSearchParams(); const r = useRouter();
  const chatId = sp.get('c') ?? '';
  const project = useDoc<any>(uid, 'projects', projectId);
  const chats = useCol<any>(uid, 'chats', [where('projectId', '==', projectId), orderBy('updatedAt', 'desc'), limit(30)], [projectId]);
  const chat = chats.data.find((c) => c.id === chatId);
  const messages = useSubCol<any>(uid, chatId ? ['chats', chatId, 'messages'] : ['chats', '__none__', 'messages'], [orderBy('seq')]);
  const [text, setText] = useState(''); const [sending, setSending] = useState(false); const [uploading, setUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.data.length, messages.data[messages.data.length - 1]?.content]);
  const running = chat?.status === 'running' || messages.data.some((m) => m.status === 'streaming');

  const send = async (fresh = false) => {
    if (!uid || !text.trim() || sending) return;
    setSending(true);
    try {
      let id = chatId;
      if (!id || fresh) { const ref = doc(collection(db, 'users', uid, 'chats')); await setDoc(ref, { projectId, title: text.trim().slice(0, 60), sessionId: null, status: 'running', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), turns: 0, costUsd: 0 }); id = ref.id; r.replace(`/projects/${projectId}/chat?c=${id}`); }
      const seq = (chat?.turns ?? 0) * 100 + 1;
      await addDoc(collection(db, 'users', uid, 'chats', id, 'messages'), { role: 'user', content: text.trim(), status: 'done', seq, at: new Date().toISOString() });
      await enqueue('project.chat', { projectId, chatId: id, message: text.trim() });
      setText('');
    } finally { setSending(false); }
  };
  const attach = async (f: File) => {
    if (f.size > 900_000) return alert('Max 900 KB via chat — drop bigger files in the Drive folder.');
    setUploading(true);
    try { const b64 = btoa(String.fromCharCode(...new Uint8Array(await f.arrayBuffer()))); await enqueue('file.put', { projectId, name: f.name, contentB64: b64 }); setText((t) => `${t}${t ? '\n' : ''}(attached ${f.name})`); } finally { setUploading(false); }
  };
  const grouped = useMemo(() => messages.data, [messages.data]);
  return (
    <div className="grid sm:grid-cols-[200px_1fr] gap-4 h-[calc(100dvh-8rem)]">
      <aside className="space-y-1 overflow-y-auto">
        <Link href="/projects" className="text-xs muted underline">← projects</Link>
        <div className="font-medium text-sm truncate mt-1">{project.data?.name ?? '…'}</div>
        <button className="btn btn-ghost text-xs w-full my-2" onClick={() => r.replace(`/projects/${projectId}/chat`)}>+ New conversation</button>
        {chats.data.map((c) => <button key={c.id} onClick={() => r.replace(`/projects/${projectId}/chat?c=${c.id}`)} className={cn('card w-full text-left px-2 py-1.5 text-xs', c.id === chatId && 'border-[var(--color-accent)]')}><div className="truncate">{c.title}</div><div className="muted flex justify-between"><span>{relTime(c.updatedAt)}</span><span>{c.turns} turns · ${(c.costUsd ?? 0).toFixed(2)}</span></div></button>)}
      </aside>
      <section className="flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {!chatId && <div className="card p-4 text-sm muted">Start a conversation. Claude runs <em>as you</em> inside <code>{project.data?.path?.replace(/^\/home\/[^/]+\//, '~/') ?? 'the project directory'}</code>; it can read and edit files there, and every turn is remembered per project.</div>}
          {grouped.map((m) => m.role === 'tool' ? (
            <div key={m.id} className="card px-3 py-2 text-xs flex items-start gap-2"><Pill className={m.status === 'streaming' ? 'p2' : m.toolOk === false ? 'p1' : 'p3'}>{m.toolName}</Pill><div className="min-w-0 flex-1"><div className="truncate font-mono">{m.toolInput}</div>{m.toolResult && <details><summary className="muted cursor-pointer">result</summary><pre className="whitespace-pre-wrap font-mono text-[11px] max-h-40 overflow-y-auto">{m.toolResult}</pre></details>}</div></div>
          ) : (
            <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-[12px] px-3 py-2 text-sm whitespace-pre-wrap', m.role === 'user' ? 'bg-[var(--color-accent)] text-white' : 'card', m.status === 'error' && 'text-red-600')}>{m.content || (m.status === 'streaming' ? <span className="muted">thinking…</span> : '')}{m.status === 'streaming' && m.content && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: 'var(--color-accent)' }} />}{m.role === 'assistant' && m.status === 'done' && m.costUsd != null && <div className="text-[10px] muted mt-1">{m.model} · {((m.durationMs ?? 0) / 1000).toFixed(0)}s · ${m.costUsd.toFixed(3)}</div>}</div></div>
          ))}
          <div ref={endRef} />
        </div>
        <form className="mt-2 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="btn btn-ghost text-xs py-2 cursor-pointer" title="Attach a file into the project dir">{uploading ? '…' : '📎'}<input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && attach(e.target.files[0])} /></label>
          <Textarea className="min-h-10 max-h-40" rows={1} placeholder={running ? 'Claude is working…' : 'Message (⌘/Ctrl+Enter to send)'} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); } }} disabled={sending} />
          <Button variant="primary" disabled={sending || !text.trim()}>{running ? 'Queue' : 'Send'}</Button>
        </form>
      </section>
    </div>
  );
}
