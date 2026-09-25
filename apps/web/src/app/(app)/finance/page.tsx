'use client';
import { useMemo, useRef, useState } from 'react';
import { orderBy, limit, where } from 'firebase/firestore';
import { useAuth } from '@/lib/auth';
import { useCol } from '@/lib/hooks';
import { patch, create, upsert, remove } from '@/lib/db';
import { api, enqueue } from '@/lib/api';
import { H1, Button, Input, Select, Modal, Field, Empty, Pill, Card } from '@/components/ui';
import { cn, fmtMoney } from '@/lib/utils';
import { parseBankCsv, normalizeVendor } from '@/lib/finance/banks';

type Tab = 'burn' | 'ledger' | 'recurring' | 'pl';

export default function Finance() {
  const { user, profile } = useAuth(); const uid = user?.uid;
  const [tab, setTab] = useState<Tab>('burn');
  const [scope, setScope] = useState<'all' | 'business' | 'personal'>('business');
  const snaps = useCol<any>(uid, 'financeSnapshots', [orderBy('computedAt', 'desc'), limit(24)]);
  const cats = useCol<any>(uid, 'categories', [orderBy('order')]);
  const recurring = useCol<any>(uid, 'recurringCosts');
  const projects = useCol<any>(uid, 'projects');
  const txs = useCol<any>(uid, 'transactions', [orderBy('date', 'desc'), limit(500)]);
  const [importing, setImporting] = useState<{ profile: string; rows: any[]; skipped: number; account: string } | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const month = new Date().toISOString().slice(0, 7);
  const cur = snaps.data.find((s) => s.id === month) ?? snaps.data[0];
  const catName = (id?: string) => cats.data.find((c) => c.id === id)?.name ?? id ?? 'uncategorised';
  const filtered = useMemo(() => txs.data.filter((t) => scope === 'all' || t.scope === scope), [txs.data, scope]);
  const unreviewed = filtered.filter((t) => !t.reviewed);

  const onFile = async (f: File) => { const text = await f.text(); const p = parseBankCsv(text); setImporting({ ...p, account: p.profile }); };
  const doImport = async () => {
    if (!importing || !uid) return; setBusy(true);
    try {
      const r = await api('/api/finance/import', { rows: importing.rows, bankProfile: importing.profile, account: importing.account, fileName: 'upload.csv' });
      setMsg(`Imported ${r.imported}, skipped ${r.duplicates} duplicates. Categorising…`); setImporting(null);
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  const exportCsv = (gst = false) => {
    const rows = filtered.map((t) => [t.date, t.amount, t.currency, t.amountNzd, `"${(t.vendor ?? '').replace(/"/g, '""')}"`, `"${(t.description ?? '').replace(/"/g, '""')}"`, catName(t.categoryId), t.scope, projects.data.find((p) => p.id === t.projectId)?.name ?? '', ...(gst ? [t.gst?.treatment ?? 'inclusive', t.gst?.amount ?? (t.gst?.treatment === 'none' ? 0 : Math.round(Math.abs(t.amountNzd) * (1 - 1 / (1 + profile.finance.gstRate)) * 100) / 100)] : []), t.reviewed ? 'yes' : 'no'].join(','));
    const head = ['date', 'amount', 'currency', 'amount_nzd', 'vendor', 'description', 'category', 'scope', 'project', ...(gst ? ['gst_treatment', 'gst_amount'] : []), 'reviewed'].join(',');
    const blob = new Blob([[head, ...rows].join('\n')], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `atlas-${gst ? 'gst' : 'ledger'}-${scope}-${month}.csv`; a.click();
  };
  const spendIn = (s: any) => scope === 'all' ? s.spend : (s.byScope?.[scope] ?? 0);
  const last6 = snaps.data.slice(0, 6).reverse();
  const maxSpend = Math.max(1, ...last6.map(spendIn));
  return (
    <div>
      <H1 right={<div className="flex gap-1 items-center"><Select value={scope} onChange={(e) => setScope(e.target.value as any)} className="!w-auto text-xs py-1"><option value="business">Business</option><option value="personal">Personal</option><option value="all">All</option></Select><Button className="text-xs py-1" onClick={() => fileRef.current?.click()}>Import CSV</Button><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></div>}>Finance</H1>
      <div className="flex gap-1 mb-4 text-sm">{(['burn', 'ledger', 'recurring', 'pl'] as Tab[]).map((t) => <button key={t} onClick={() => setTab(t)} className={cn('px-3 py-1 rounded-full', tab === t ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)] font-medium' : 'muted')}>{{ burn: 'Burn', ledger: `Ledger${unreviewed.length ? ` · ${unreviewed.length}` : ''}`, recurring: 'Recurring', pl: 'P&L' }[t]}</button>)}</div>
      {msg && <div className="text-xs muted mb-3">{msg}</div>}

      {tab === 'burn' && (cur ? <div className="space-y-4">
        <Card><div className="text-xs muted">This month · {scope}</div><div className="text-4xl font-semibold tracking-tight">{fmtMoney(spendIn(cur))}</div><div className="text-xs muted mt-1">run-rate {fmtMoney(cur.runRate)}/mo · trailing 3 mo {fmtMoney(cur.trailing3)} · 12 mo {fmtMoney(cur.trailing12)} · income {fmtMoney(cur.income)} · net {fmtMoney(cur.net)}</div>
          <div className="flex items-end gap-1 h-16 mt-4">{last6.map((s) => <div key={s.id} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-t" style={{ height: `${(spendIn(s) / maxSpend) * 48}px`, background: s.id === cur.id ? 'var(--color-accent)' : 'var(--color-line)' }} /><span className="text-[9px] muted">{s.id.slice(5)}</span></div>)}</div></Card>
        {cur.anomalies?.length > 0 && <Card><div className="text-xs font-medium mb-2">Anomalies</div>{cur.anomalies.map((a: any, i: number) => <div key={i} className="text-sm flex gap-2"><Pill className="p1">{a.type}</Pill><span>{a.detail}</span><span className="muted ml-auto">{fmtMoney(a.amount)}</span></div>)}</Card>}
        <Card><div className="text-xs font-medium mb-2">By category</div>{Object.entries(cur.byCategory ?? {}).sort((a: any, b: any) => b[1] - a[1]).map(([c, v]: any) => { const prev = snaps.data[1]?.byCategory?.[c] ?? 0; const d = prev ? Math.round(((v - prev) / prev) * 100) : null; return <div key={c} className="text-sm flex items-center gap-2 py-1"><span className="w-40 truncate">{catName(c)}</span><div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--color-line)' }}><div className="h-full rounded-full" style={{ width: `${(v / (Object.values(cur.byCategory)[0] as number || 1)) * 100}%`, background: 'var(--color-accent)' }} /></div><span className="w-20 text-right">{fmtMoney(v)}</span><span className={cn('w-12 text-right text-xs', d != null && d > 30 ? 'text-red-600' : 'muted')}>{d != null ? `${d > 0 ? '+' : ''}${d}%` : ''}</span></div>; })}</Card>
        {Object.keys(cur.byProject ?? {}).length > 0 && <Card><div className="text-xs font-medium mb-2">By project</div>{Object.entries(cur.byProject).sort((a: any, b: any) => b[1] - a[1]).map(([p, v]: any) => <div key={p} className="text-sm flex justify-between py-0.5"><span>{projects.data.find((x) => x.id === p)?.name ?? p}</span><span>{fmtMoney(v)}</span></div>)}</Card>}
        <div className="text-xs muted">Snapshot {new Date(cur.computedAt).toLocaleString('en-NZ')} · <button className="underline" onClick={() => enqueue('finance.snapshot', {})}>recompute</button></div>
      </div> : <Empty>No data yet. Import a bank CSV to get your first burn number.</Empty>)}

      {tab === 'ledger' && <div>
        <div className="flex gap-2 mb-3 text-xs"><Button className="text-xs py-1" onClick={() => exportCsv(false)}>Export CSV</Button><Button className="text-xs py-1" onClick={() => exportCsv(true)}>GST export</Button><Button className="text-xs py-1" onClick={() => enqueue('finance.categorize', {})}>Categorise uncategorised</Button>{unreviewed.length > 0 && <Button className="text-xs py-1" onClick={async () => { for (const t of unreviewed.slice(0, 50)) await patch(uid!, 'transactions', t.id, { reviewed: true }); }}>Mark {Math.min(50, unreviewed.length)} reviewed</Button>}</div>
        {filtered.length === 0 ? <Empty>No transactions.</Empty> : <div className="space-y-1">{filtered.slice(0, 300).map((t) => <TxRow key={t.id} t={t} cats={cats.data} projects={projects.data} catName={catName} onChange={(d) => { patch(uid!, 'transactions', t.id, d); if (d.categoryId) upsert(uid!, 'vendorMemory', (t.vendorNormalized || normalizeVendor(t.vendor || t.description) || 'unknown').replace(/\//g, '-'), { categoryId: d.categoryId, scope: d.scope ?? t.scope }); }} />)}</div>}
      </div>}

      {tab === 'recurring' && <div className="space-y-2">
        <div className="flex justify-between items-center text-xs muted mb-2"><span>Fixed monthly ≈ {fmtMoney(recurring.data.filter((r) => r.status === 'active').reduce((a, r) => a + (r.cycle === 'annual' ? r.amount / 12 : r.cycle === 'weekly' ? r.amount * 4.33 : r.amount), 0))}</span><div className="flex gap-2"><Button className="text-xs py-1" onClick={() => enqueue('recurring.detect', {})}>Detect from ledger</Button><Button className="text-xs py-1" onClick={() => create(uid!, 'recurringCosts', { vendor: 'New subscription', amount: 0, currency: 'NZD', cycle: 'monthly', nextRenewalAt: new Date().toISOString().slice(0, 10), status: 'active', evidenceTransactionIds: [] })}>+ Add</Button></div></div>
        {recurring.data.length === 0 ? <Empty>Nothing yet. Import a few months of statements and hit "Detect from ledger".</Empty> : recurring.data.sort((a, b) => (a.status === 'candidate' ? -1 : 1) - (b.status === 'candidate' ? -1 : 1) || a.nextRenewalAt?.localeCompare(b.nextRenewalAt)).map((r) => <RecurringRow key={r.id} r={r} cats={cats.data} projects={projects.data} onChange={(d) => patch(uid!, 'recurringCosts', r.id, d)} onDelete={() => remove(uid!, 'recurringCosts', r.id)} />)}
      </div>}

      {tab === 'pl' && (snaps.data.length === 0 ? <Empty>No months yet.</Empty> : <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-xs muted text-left"><th className="p-2">Month</th><th className="p-2 text-right">Income</th><th className="p-2 text-right">Costs</th><th className="p-2 text-right">Net</th><th className="p-2 text-right">Margin</th></tr></thead><tbody>
        {snaps.data.map((s) => <tr key={s.id} className="border-t"><td className="p-2">{s.id}</td><td className="p-2 text-right">{fmtMoney(s.income)}</td><td className="p-2 text-right">{fmtMoney(s.spend)}</td><td className={cn('p-2 text-right', s.net < 0 && 'text-red-600')}>{fmtMoney(s.net)}</td><td className="p-2 text-right muted">{s.income ? Math.round((s.net / s.income) * 100) + '%' : '–'}</td></tr>)}
        {(() => { const byQ = new Map<string, { i: number; c: number }>(); for (const s of snaps.data) { const q = `${s.id.slice(0, 4)}-Q${Math.ceil(Number(s.id.slice(5)) / 3)}`; const x = byQ.get(q) ?? { i: 0, c: 0 }; x.i += s.income; x.c += s.spend; byQ.set(q, x); } return [...byQ].map(([q, x]) => <tr key={q} className="border-t font-medium" style={{ background: 'var(--color-accent-soft)' }}><td className="p-2">{q}</td><td className="p-2 text-right">{fmtMoney(x.i)}</td><td className="p-2 text-right">{fmtMoney(x.c)}</td><td className="p-2 text-right">{fmtMoney(x.i - x.c)}</td><td className="p-2 text-right">{x.i ? Math.round(((x.i - x.c) / x.i) * 100) + '%' : '–'}</td></tr>); })()}
      </tbody></table></div>)}

      <Modal open={Boolean(importing)} onClose={() => setImporting(null)} title="Import bank statement">{importing && <div className="space-y-3 text-sm">
        <div>Detected <b>{importing.profile}</b> format · {importing.rows.length} rows · {importing.skipped} skipped</div>
        <Field label="Bank / account"><Select value={importing.account} onChange={(e) => setImporting({ ...importing, account: e.target.value })}>{['anz', 'asb', 'bnz', 'kiwibank', 'westpac', 'generic'].map((b) => <option key={b}>{b}</option>)}</Select></Field>
        <div className="max-h-48 overflow-y-auto text-xs card p-2">{importing.rows.slice(0, 8).map((r, i) => <div key={i} className="flex gap-2"><span className="muted w-20">{r.date}</span><span className="flex-1 truncate">{r.description}</span><span className={r.amount < 0 ? '' : 'text-green-600'}>{r.amount}</span></div>)}{importing.rows.length > 8 && <div className="muted">… {importing.rows.length - 8} more</div>}</div>
        <Button variant="primary" className="w-full" disabled={busy} onClick={doImport}>Import {importing.rows.length} transactions</Button></div>}</Modal>
    </div>
  );
}
function TxRow({ t, cats, projects, catName, onChange }: { t: any; cats: any[]; projects: any[]; catName: (id?: string) => string; onChange: (d: any) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn('card px-3 py-2 text-sm', !t.reviewed && 'border-l-2 border-l-[var(--color-accent)]')}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setOpen(!open)}><span className="muted text-xs w-12 shrink-0">{t.date.slice(5)}</span><span className="flex-1 truncate">{t.vendor || t.description}</span><span className="text-xs muted hidden sm:inline truncate max-w-32">{catName(t.categoryId)}</span><Pill className={t.scope === 'personal' ? 'p3' : ''}>{t.scope?.[0]}</Pill><span className={cn('w-20 text-right tabular-nums', t.amountNzd > 0 && 'text-green-600')}>{fmtMoney(t.amountNzd)}</span><input type="checkbox" checked={Boolean(t.reviewed)} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange({ reviewed: e.target.checked })} title="reviewed" /></div>
      {open && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-xs"><Select value={t.categoryId ?? ''} onChange={(e) => onChange({ categoryId: e.target.value, categorizedBy: 'user' })}><option value="">— category —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select value={t.scope} onChange={(e) => onChange({ scope: e.target.value })}><option value="business">business</option><option value="personal">personal</option></Select><Select value={t.projectId ?? ''} onChange={(e) => onChange({ projectId: e.target.value || null })}><option value="">— project —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><Select value={t.gst?.treatment ?? 'inclusive'} onChange={(e) => onChange({ gst: { ...(t.gst ?? {}), treatment: e.target.value } })}><option value="inclusive">GST inclusive</option><option value="exclusive">GST exclusive</option><option value="none">No GST</option></Select><div className="col-span-full muted">{t.description} · {t.source?.type}{t.receiptPath ? ' · receipt attached' : ''}</div></div>}
    </div>
  );
}
function RecurringRow({ r, cats, projects, onChange, onDelete }: { r: any; cats: any[]; projects: any[]; onChange: (d: any) => void; onDelete: () => void }) {
  const soon = r.nextRenewalAt && (new Date(r.nextRenewalAt).getTime() - Date.now()) < 7 * 86400e3 && r.nextRenewalAt >= new Date().toISOString().slice(0, 10);
  return (
    <div className={cn('card p-3 text-sm', r.status === 'candidate' && 'border-dashed')}>
      <div className="flex items-center gap-2 flex-wrap"><Input className="!w-40 py-1" value={r.vendor} onChange={(e) => onChange({ vendor: e.target.value })} /><Input type="number" step="any" className="!w-24 py-1" value={r.amount} onChange={(e) => onChange({ amount: Number(e.target.value) })} /><Select className="!w-28 py-1" value={r.cycle} onChange={(e) => onChange({ cycle: e.target.value })}>{['weekly', 'monthly', 'annual'].map((c) => <option key={c}>{c}</option>)}</Select><Input type="date" className="!w-36 py-1" value={r.nextRenewalAt ?? ''} onChange={(e) => onChange({ nextRenewalAt: e.target.value })} />{soon && <Pill className="p1">renews soon</Pill>}{r.usageFlag && <Pill className="p1">unused 60d — keep or cancel?</Pill>}{r.status === 'candidate' && <Pill>detected</Pill>}</div>
      <div className="flex items-center gap-2 mt-2 text-xs"><Select className="!w-40 py-1" value={r.categoryId ?? ''} onChange={(e) => onChange({ categoryId: e.target.value })}><option value="">— category —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Select className="!w-40 py-1" value={r.projectId ?? ''} onChange={(e) => onChange({ projectId: e.target.value || null })}><option value="">— project —</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select><span className="ml-auto flex gap-1">{r.status === 'candidate' && <Button className="text-xs py-1" variant="primary" onClick={() => onChange({ status: 'active' })}>Confirm</Button>}{r.status === 'active' && <Button className="text-xs py-1" onClick={() => onChange({ status: 'cancelled' })}>Cancel</Button>}{r.status === 'cancelled' && <Button className="text-xs py-1" onClick={() => onChange({ status: 'active' })}>Reactivate</Button>}<Button className="text-xs py-1" variant="danger" onClick={onDelete}>✕</Button></span></div>
    </div>
  );
}
