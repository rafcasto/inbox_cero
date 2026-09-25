import { CategorizeOutput, ReceiptExtractOutput, DEFAULT_CATEGORIES, type Transaction } from '@atlas/schemas';
import { col, now, listDocs, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';
import { sha256 } from '../lib/crypto';

const categoriesLine = async (uid: string) => {
  const cats = await listDocs(uid, 'categories');
  const list = cats.length ? cats : DEFAULT_CATEGORIES;
  return list.map((c: any) => `${c.id} → ${c.name} (${c.defaultScope})`).join('\n');
};

const vendorMemory = async (uid: string) => {
  const s = await listDocs(uid, 'vendorMemory', (q) => q.limit(300));
  return s.map((v) => `${v.id} → ${v.categoryId}, ${v.scope}`).join('\n') || '(empty)';
};

/** Categorise unreviewed/uncategorised transactions. Vendor memory first, Claude for the rest. */
export const financeCategorize = async (ctx: UserContext, payload: { transactionIds?: string[] }) => {
  let txs = payload.transactionIds?.length
    ? (await Promise.all(payload.transactionIds.map(async (id) => ({ id, ...(await col(ctx.uid, 'transactions').doc(id).get()).data() })))) as (Transaction & { id: string })[]
    : await listDocs<Transaction>(ctx.uid, 'transactions', (q) => q.where('categoryId', '==', null).limit(50));
  txs = txs.filter((t) => t && t.date);
  if (!txs.length) return { categorized: 0 };
  const memory = new Map((await listDocs(ctx.uid, 'vendorMemory')).map((v) => [v.id, v]));
  const batch = col(ctx.uid, 'transactions').firestore.batch();
  const forBrain: typeof txs = [];
  let fromMemory = 0;
  for (const t of txs) {
    const key = (t.vendorNormalized || t.vendor || t.description).toLowerCase().trim();
    const m = memory.get(key);
    if (m) { batch.set(col(ctx.uid, 'transactions').doc(t.id), { categoryId: m.categoryId, scope: m.scope, vendorNormalized: key, categorizedBy: 'vendorMemory' }, { merge: true }); fromMemory++; }
    else forBrain.push(t);
  }
  let fromBrain = 0;
  if (forBrain.length) {
    const res = await runTask({
      ctx, task: 'finance.categorize', schema: CategorizeOutput, refId: sha256(forBrain.map((t) => t.id).join(',')),
      vars: { categories: await categoriesLine(ctx.uid), vendorMemory: await vendorMemory(ctx.uid), transactions: forBrain.map((t) => ({ id: t.id, date: t.date, amount: t.amount, description: t.description, vendor: t.vendor })) },
    });
    for (const r of res.output.results) {
      batch.set(col(ctx.uid, 'transactions').doc(r.id), { categoryId: r.categoryId, scope: r.scope, vendorNormalized: r.vendorNormalized, categorizedBy: 'brain', categorizeConfidence: r.confidence, recurringCandidate: r.isRecurringCandidate }, { merge: true });
      fromBrain++;
    }
  }
  await batch.commit();
  return { categorized: fromMemory + fromBrain, fromMemory, fromBrain };
};

/** Turn a receipt (email item or WhatsApp photo caption/OCR text) into a draft transaction. */
export const financeReceipt = async (ctx: UserContext, payload: { itemId?: string; text?: string; storagePath?: string }) => {
  let text = payload.text ?? '';
  if (payload.itemId) {
    const it = (await col(ctx.uid, 'items').doc(payload.itemId).get()).data();
    text = `${it?.raw?.subject ?? ''}\nFrom: ${it?.raw?.from ?? ''}\n\n${it?.raw?.body ?? it?.raw?.snippet ?? ''}`.slice(0, 6000);
  }
  if (!text.trim()) throw new Error('no receipt text');
  const res = await runTask({ ctx, task: 'finance.receipt', schema: ReceiptExtractOutput, refId: payload.itemId, vars: { categories: await categoriesLine(ctx.uid), text } });
  const o = res.output;
  if (o.amount === null) { await audit(ctx.uid, { actor: 'brain', action: 'receipt: could not extract amount', target: payload.itemId ? { collection: 'items', id: payload.itemId } : undefined }); return { created: false }; }
  const date = o.date ?? now().slice(0, 10);
  const dedupeKey = sha256(`${ctx.uid}|receipt|${o.vendor.toLowerCase()}|${date}|${o.amount}`);
  const gstRate = ctx.profile.finance.gstRate;
  const doc = {
    date, amount: -Math.abs(o.amount), currency: o.currency, amountNzd: -Math.abs(o.amount), fxRate: 1,
    vendor: o.vendor, vendorNormalized: o.vendor.toLowerCase(), description: `Receipt: ${o.vendor}`,
    categoryId: o.categoryId ?? undefined, scope: o.scope,
    gst: { treatment: o.gstInclusive ? 'inclusive' : 'exclusive', amount: o.gstInclusive ? Math.round((o.amount - o.amount / (1 + gstRate)) * 100) / 100 : Math.round(o.amount * gstRate * 100) / 100 },
    receiptPath: payload.storagePath, source: { type: payload.itemId ? 'receiptEmail' : 'whatsapp', itemId: payload.itemId }, dedupeKey, reviewed: false, tags: [], createdAt: now(),
    extractConfidence: o.confidence,
  };
  await col(ctx.uid, 'transactions').doc(dedupeKey).set(doc, { merge: true });
  if (payload.itemId) {
    await col(ctx.uid, 'items').doc(payload.itemId).set({ linkedTransactionId: dedupeKey }, { merge: true });
    await col(ctx.uid, 'financeQueue').doc(payload.itemId).set({ status: 'done', transactionId: dedupeKey }, { merge: true });
  }
  await audit(ctx.uid, { actor: 'brain', action: `receipt → transaction ${o.vendor} ${o.amount} ${o.currency}`, target: { collection: 'transactions', id: dedupeKey }, model: res.model });
  return { created: true, transactionId: dedupeKey };
};

const monthKey = (d: string) => d.slice(0, 7);
const addMonths = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y!, m! - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/** Recompute monthly snapshot(s) with anomalies. payload.month = 'yyyy-MM' (default current). */
export const financeSnapshot = async (ctx: UserContext, payload: { month?: string; scope?: 'business' | 'personal' | 'all' }) => {
  const month = payload.month ?? now().slice(0, 7);
  const from = addMonths(month, -12) + '-01';
  const txs = await listDocs<Transaction>(ctx.uid, 'transactions', (q) => q.where('date', '>=', from).where('date', '<', addMonths(month, 1) + '-01'));
  const inScope = (t: Transaction) => t.categoryId !== 'transfer';
  const byMonth = new Map<string, Transaction[]>();
  for (const t of txs.filter(inScope)) { const k = monthKey(t.date); byMonth.set(k, [...(byMonth.get(k) ?? []), t]); }
  const sum = (arr: Transaction[], f: (t: Transaction) => boolean = () => true) => Math.round(arr.filter(f).reduce((a, t) => a + t.amountNzd, 0) * 100) / 100;
  const cur = byMonth.get(month) ?? [];
  const spend = -sum(cur, (t) => t.amountNzd < 0);
  const income = sum(cur, (t) => t.amountNzd > 0);
  const group = (arr: Transaction[], key: (t: Transaction) => string | undefined) => { const o: Record<string, number> = {}; for (const t of arr) { if (t.amountNzd >= 0) continue; const k = key(t) ?? 'uncategorised'; o[k] = Math.round(((o[k] ?? 0) - t.amountNzd) * 100) / 100; } return o; };
  const byCategory = group(cur, (t) => t.categoryId);
  const byProject = group(cur.filter((t) => t.projectId), (t) => t.projectId);
  const byScope = group(cur, (t) => t.scope);
  const prev = byMonth.get(addMonths(month, -1)) ?? [];
  const prevByCat = group(prev, (t) => t.categoryId);
  const trailing = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += -sum(byMonth.get(addMonths(month, -i)) ?? [], (t) => t.amountNzd < 0); return Math.round(s * 100) / 100; };
  const trailing3 = trailing(3); const trailing12 = trailing(12);
  const recurring = await listDocs(ctx.uid, 'recurringCosts', (q) => q.where('status', '==', 'active'));
  const fixed = recurring.reduce((a, r: any) => a + (r.cycle === 'annual' ? r.amount / 12 : r.cycle === 'weekly' ? r.amount * 4.33 : r.amount), 0);
  const runRate = Math.round((fixed + Math.max(0, trailing3 / 3 - fixed)) * 100) / 100;
  const th = ctx.profile.finance.anomaly;
  const anomalies: Array<{ type: 'categoryJump' | 'newVendor' | 'duplicate'; detail: string; amount: number }> = [];
  for (const [c, v] of Object.entries(byCategory)) { const p = prevByCat[c] ?? 0; if (p > 0 && v > p * (1 + th.categoryJumpPct / 100) && v - p > 20) anomalies.push({ type: 'categoryJump', detail: `${c} up ${Math.round(((v - p) / p) * 100)}% vs last month`, amount: v }); }
  const seenVendors = new Set(txs.filter((t) => monthKey(t.date) < month).map((t) => t.vendorNormalized));
  for (const t of cur) if (t.amountNzd < 0 && -t.amountNzd >= th.newVendorThreshold && t.vendorNormalized && !seenVendors.has(t.vendorNormalized)) anomalies.push({ type: 'newVendor', detail: `new vendor ${t.vendor} on ${t.date}`, amount: -t.amountNzd });
  const seenDup = new Map<string, Transaction>();
  for (const t of cur) { const k = `${t.vendorNormalized}|${t.amountNzd}`; const o = seenDup.get(k); if (o && Math.abs(new Date(t.date).getTime() - new Date(o.date).getTime()) <= th.duplicateWindowDays * 86400e3) anomalies.push({ type: 'duplicate', detail: `${t.vendor} ${-t.amountNzd} on ${o.date} and ${t.date}`, amount: -t.amountNzd }); seenDup.set(k, t); }
  const snap = { income, spend, net: Math.round((income - spend) * 100) / 100, byCategory, byProject, byScope, runRate, trailing3, trailing12, anomalies, unreviewed: cur.filter((t) => !t.reviewed).length, computedAt: now() };
  await col(ctx.uid, 'financeSnapshots').doc(month).set(snap);
  return snap;
};

/** Detect recurring charges from the ledger and create/refresh candidates. */
export const recurringDetect = async (ctx: UserContext) => {
  const from = addMonths(now().slice(0, 7), -6) + '-01';
  const txs = await listDocs<Transaction>(ctx.uid, 'transactions', (q) => q.where('date', '>=', from));
  const byVendor = new Map<string, Transaction[]>();
  for (const t of txs) if (t.amountNzd < 0 && t.vendorNormalized) byVendor.set(t.vendorNormalized, [...(byVendor.get(t.vendorNormalized) ?? []), t]);
  const existing = new Map((await listDocs(ctx.uid, 'recurringCosts')).map((r: any) => [r.vendor, r]));
  let created = 0;
  for (const [vendor, list] of byVendor) {
    if (list.length < 2) continue;
    const sorted = list.sort((a, b) => a.date.localeCompare(b.date));
    const gaps = sorted.slice(1).map((t, i) => (new Date(t.date).getTime() - new Date(sorted[i]!.date).getTime()) / 86400e3);
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const amounts = sorted.map((t) => -t.amountNzd);
    const amountStable = Math.max(...amounts) - Math.min(...amounts) < Math.max(2, 0.15 * amounts[0]!);
    let cycle: 'weekly' | 'monthly' | 'annual' | null = null;
    if (avg >= 5 && avg <= 9) cycle = 'weekly'; else if (avg >= 26 && avg <= 35) cycle = 'monthly'; else if (avg >= 350 && avg <= 380) cycle = 'annual';
    if (!cycle || !amountStable) continue;
    const last = sorted[sorted.length - 1]!;
    const next = new Date(last.date); next.setDate(next.getDate() + (cycle === 'weekly' ? 7 : cycle === 'monthly' ? 30 : 365));
    const ex = existing.get(vendor);
    const doc = { vendor, amount: Math.round((amounts.reduce((a, b) => a + b, 0) / amounts.length) * 100) / 100, currency: 'NZD', cycle, nextRenewalAt: next.toISOString().slice(0, 10), categoryId: last.categoryId, projectId: last.projectId, lastSeenAt: last.date, evidenceTransactionIds: sorted.map((t) => t.id), status: ex?.status ?? 'candidate', updatedAt: now() };
    await col(ctx.uid, 'recurringCosts').doc(ex?.id ?? vendor.replace(/[^a-z0-9]+/g, '-')).set(doc, { merge: true });
    if (!ex) created++;
  }
  // usage flag: active recurring with no linked project and no transaction in 60 days
  const cutoff = new Date(Date.now() - 60 * 86400e3).toISOString().slice(0, 10);
  for (const r of await listDocs(ctx.uid, 'recurringCosts', (q) => q.where('status', '==', 'active'))) {
    const unused = !r.projectId && (!r.lastSeenAt || r.lastSeenAt < cutoff);
    await col(ctx.uid, 'recurringCosts').doc(r.id).set({ usageFlag: unused ? 'unused60d' : null }, { merge: true });
  }
  return { created, vendors: byVendor.size };
};

/** Monthly WhatsApp finance summary text (sent by digest/nudge job). */
export const financeMonthlyText = async (ctx: UserContext) => {
  const month = addMonths(now().slice(0, 7), -1);
  const s = await financeSnapshot(ctx, { month });
  const top = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} $${v.toFixed(0)}`).join(', ');
  const renewals = (await listDocs(ctx.uid, 'recurringCosts', (q) => q.where('status', '==', 'active'))).filter((r: any) => r.nextRenewalAt <= addMonths(month, 2) + '-01' && r.nextRenewalAt >= now().slice(0, 10)).map((r: any) => `${r.vendor} $${r.amount} on ${r.nextRenewalAt}`);
  const biggest = s.anomalies[0]?.detail ?? 'no anomalies';
  return `📊 ${month} — total cost $${s.spend.toFixed(0)}, income $${s.income.toFixed(0)}, net $${s.net.toFixed(0)}.\nTop: ${top || 'n/a'}.\nBiggest change: ${biggest}.\nRenewals due: ${renewals.slice(0, 5).join('; ') || 'none'}.\nUnreviewed: ${s.unreviewed}.`;
};
