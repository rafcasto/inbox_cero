'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { H1, Button, Card, Input, Empty, Pill } from '@/components/ui';
import { relTime } from '@/lib/utils';

export default function Admin() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState<any>(null); const [email, setEmail] = useState(''); const [invite, setInvite] = useState('');
  const load = () => api('/api/admin').then(setData).catch((e) => setData({ error: e.message }));
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin) return <Empty>Admin only.</Empty>;
  if (!data) return <div className="muted text-sm">Loading…</div>;
  if (data.error) return <Empty>{data.error}</Empty>;
  const hbAge = data.health.heartbeat ? (Date.now() - new Date(data.health.heartbeat).getTime()) / 1000 : null;
  return (
    <div className="space-y-4">
      <H1 right={<Button className="text-xs py-1" onClick={load}>Refresh</Button>}>Admin</H1>
      <div className="grid grid-cols-3 gap-2">
        <Card><div className="text-xs muted">Pi brain</div><div className="text-lg font-semibold">{hbAge === null ? 'offline' : hbAge < 120 ? 'online' : `stale ${Math.round(hbAge / 60)}m`}</div></Card>
        <Card><div className="text-xs muted">Queue</div><div className="text-lg font-semibold">{data.health.pending} <span className="text-xs muted font-normal">stream length</span></div></Card>
        <Card><div className="text-xs muted">Dead letters</div><div className="text-lg font-semibold">{data.health.dlq}</div></Card>
      </div>
      <Card><div className="text-xs font-medium mb-2">Users</div><table className="w-full text-sm"><thead><tr className="text-xs muted text-left"><th>Email</th><th>Status</th><th>Items</th><th>Calls (30d)</th><th>Cost (30d)</th><th>Last seen</th></tr></thead><tbody>{data.users.map((u: any) => <tr key={u.uid} className="border-t"><td className="py-1">{u.email}{u.admin && <Pill className="ml-1">admin</Pill>}</td><td>{u.status}</td><td>{u.items}</td><td>{u.calls}</td><td>${u.cost.toFixed(2)}</td><td className="muted">{relTime(u.lastSeenAt)}</td></tr>)}</tbody></table></Card>
      <Card><div className="text-xs font-medium mb-2">Invites</div>
        <form className="flex gap-2 mb-2" onSubmit={async (e) => { e.preventDefault(); const r = await api('/api/admin/invite', { email }); setInvite(r.code); setEmail(''); load(); }}><Input placeholder="email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} /><Button variant="primary">Create invite</Button></form>
        {invite && <div className="text-sm mb-2">New code: <code className="font-mono">{invite}</code></div>}
        {data.invites.map((i: any) => <div key={i.code} className="text-xs flex gap-2 py-0.5"><code className="font-mono">{i.code}</code><span className="muted">{i.email ?? 'any'}</span><span className="ml-auto muted">{i.usedBy ? `used ${relTime(i.usedAt)}` : `expires ${relTime(i.expiresAt)}`}</span></div>)}
      </Card>
      {data.dlq?.length > 0 && <Card><div className="text-xs font-medium mb-2">Dead-letter jobs</div>{data.dlq.map((d: any, i: number) => <div key={i} className="text-xs py-1 border-t"><span className="font-mono">{d.job?.type}</span> {d.job?.userId} — <span className="text-red-600">{d.err}</span></div>)}</Card>}
    </div>
  );
}
