import { adminDb, handle, requireUser, nowIso, audit, HttpError } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
import { sha256 } from '@/lib/server/crypto';
import { normalizeVendor } from '@/lib/finance/banks';
import { z } from 'zod';
const Body = z.object({ rows: z.array(z.object({ date: z.string(), amount: z.number(), description: z.string(), vendor: z.string() })).max(5000), bankProfile: z.string(), account: z.string(), fileName: z.string().optional() });
export const POST = handle(async (req) => {
  const { uid } = await requireUser(req);
  const b = Body.safeParse(await req.json());
  if (!b.success) throw new HttpError(400, b.error.message);
  const db = adminDb(); const user = db.collection('users').doc(uid);
  const profile = (await user.collection('profile').doc('main').get()).data() ?? {};
  const defaultScope = profile.finance?.defaultScope ?? 'business';
  const vendorDefaults: Record<string, string> = profile.finance?.vendorDefaults ?? {};
  const memory = new Map((await user.collection('vendorMemory').get()).docs.map((d) => [d.id, d.data()]));
  const importRef = user.collection('bankImports').doc();
  let imported = 0, duplicates = 0; const newIds: string[] = [];
  let batch = db.batch(); let n = 0;
  for (const r of b.data.rows) {
    const key = sha256(`${uid}|${b.data.account}|${r.date}|${r.amount}|${r.description}`);
    const ref = user.collection('transactions').doc(key);
    if ((await ref.get()).exists) { duplicates++; continue; }
    const vn = normalizeVendor(r.vendor || r.description);
    const mem = memory.get(vn.replace(/\//g, '-'));
    const scope = mem?.scope ?? vendorDefaults[vn] ?? defaultScope;
    batch.set(ref, { date: r.date, amount: r.amount, currency: 'NZD', amountNzd: r.amount, fxRate: 1, vendor: r.vendor, vendorNormalized: vn, description: r.description, categoryId: mem?.categoryId ?? (r.amount > 0 && /salary|payment received|invoice/i.test(r.description) ? 'income' : null), scope, gst: { treatment: scope === 'business' ? 'inclusive' : 'none', amount: 0 }, source: { type: 'bankImport', importId: importRef.id, bankAccountId: b.data.account }, dedupeKey: key, reviewed: false, tags: [], categorizedBy: mem ? 'vendorMemory' : null, createdAt: nowIso() });
    imported++; if (!mem) newIds.push(key);
    if (++n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
  }
  await batch.commit();
  await importRef.set({ bankProfile: b.data.bankProfile, bankAccountId: b.data.account, fileName: b.data.fileName ?? '', rows: b.data.rows.length, imported, duplicates, importedAt: nowIso() });
  await audit(uid, `imported ${imported} transactions (${duplicates} duplicates skipped) from ${b.data.account}`);
  if (newIds.length) for (let i = 0; i < newIds.length; i += 40) await enqueueJob({ userId: uid, type: 'finance.categorize', payload: { transactionIds: newIds.slice(i, i + 40) } });
  await enqueueJob({ userId: uid, type: 'finance.snapshot', payload: {} });
  await enqueueJob({ userId: uid, type: 'recurring.detect', payload: {} });
  return { ok: true, imported, duplicates };
});
