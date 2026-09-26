'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { relTime } from '@/lib/utils';

/** Small status dot with a details popover. Polls every 30 s. */
export function PiStatus({ compact }: { compact?: boolean }) {
  const [h, setH] = useState<any | null>(null); const [open, setOpen] = useState(false);
  useEffect(() => { let alive = true; const tick = () => api('/api/health').then((x) => alive && setH(x)).catch((e) => alive && setH({ status: 'unknown', reason: e.message })); tick(); const t = setInterval(tick, 30_000); return () => { alive = false; clearInterval(t); }; }, []);
  const color = h?.status === 'online' ? '#22c55e' : h?.status === 'stale' ? '#f59e0b' : '#ef4444';
  const label = h ? (h.status === 'online' ? 'Pi online' : h.status === 'stale' ? `Pi stale (${h.ageSec}s)` : h.status === 'offline' ? 'Pi offline' : h.reason ?? 'unknown') : 'checking…';
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`flex items-center gap-1.5 text-[11px] muted ${compact ? '' : 'px-3 py-1'}`} title={label}><span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />{!compact && label}</button>
      {open && h && <div className="absolute z-40 bottom-full mb-1 left-0 card p-3 text-xs w-64 space-y-1" onMouseLeave={() => setOpen(false)}>
        <div className="font-medium">{label}</div>
        {h.beat?.at && <div className="muted">last heartbeat {relTime(h.beat.at)} ago</div>}
        {h.beat?.lastJob && <div>last job: <code>{h.beat.lastJob.type}</code> {relTime(h.beat.lastJob.at)} ago ({h.beat.lastJob.ms} ms)</div>}
        {h.beat && <div className="muted">jobs ok {h.beat.ok ?? 0} · failed {h.beat.failed ?? 0} · since {relTime(h.beat.started)}</div>}
        <div className="muted">queue {h.pending ?? '–'} · dead letters {h.dlq ?? '–'}</div>
        {h.beat && h.beat.token === false && <div className="text-red-600">Claude subscription token missing on the Pi</div>}
        {h.status !== 'online' && <div className="text-red-600">Interactive features (ask, sessions, drafts) won't respond until the brain is back. On the Pi: <code>sudo systemctl status atlas-brain</code></div>}
      </div>}
    </div>
  );
}
