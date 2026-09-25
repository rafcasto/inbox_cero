import Papa from 'papaparse';

/** Per-bank CSV column profiles for NZ banks. Amounts: negative = spend. */
export type Row = { date: string; amount: number; description: string; vendor: string; balance?: number };
type Profile = { detect: (headers: string[]) => boolean; map: (r: Record<string, string>) => Row | null };

const num = (s?: string) => { const n = parseFloat(String(s ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : 0; };
const iso = (s: string) => {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/); if (m) return `20${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(t); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const has = (h: string[], ...names: string[]) => names.every((n) => h.some((x) => x.toLowerCase().replace(/\s+/g, '') === n));
const get = (r: Record<string, string>, ...keys: string[]) => { for (const k of keys) { const hit = Object.keys(r).find((x) => x.toLowerCase().replace(/\s+/g, '') === k); if (hit && r[hit] !== undefined) return r[hit]!; } return ''; };

export const PROFILES: Record<string, Profile> = {
  anz: { detect: (h) => has(h, 'type', 'details', 'particulars', 'code', 'reference', 'amount', 'date'), map: (r) => ({ date: iso(get(r, 'date')), amount: num(get(r, 'amount')), description: [get(r, 'details'), get(r, 'particulars'), get(r, 'code'), get(r, 'reference')].filter(Boolean).join(' '), vendor: get(r, 'details') || get(r, 'particulars') }) },
  asb: { detect: (h) => has(h, 'date', 'uniqueid', 'trantype', 'payee', 'amount'), map: (r) => ({ date: iso(get(r, 'date')), amount: num(get(r, 'amount')), description: [get(r, 'payee'), get(r, 'memo'), get(r, 'trantype')].filter(Boolean).join(' '), vendor: get(r, 'payee') }) },
  bnz: { detect: (h) => has(h, 'date', 'amount', 'payee') && h.some((x) => /transaction ?type/i.test(x)), map: (r) => ({ date: iso(get(r, 'date')), amount: num(get(r, 'amount')), description: [get(r, 'payee'), get(r, 'particulars'), get(r, 'code'), get(r, 'reference')].filter(Boolean).join(' '), vendor: get(r, 'payee') }) },
  kiwibank: { detect: (h) => has(h, 'date') && h.some((x) => /memo\/?description/i.test(x)) && h.some((x) => /amount/i.test(x)), map: (r) => { const memo = Object.entries(r).find(([k]) => /memo\/?description/i.test(k))?.[1] ?? ''; const amt = get(r, 'amount') || (num(get(r, 'credit')) - num(get(r, 'debit'))).toString(); return { date: iso(get(r, 'date')), amount: num(amt), description: memo, vendor: memo.split(';')[0] ?? memo }; } },
  westpac: { detect: (h) => has(h, 'date', 'amount') && h.some((x) => /othe?r ?party/i.test(x)), map: (r) => { const party = Object.entries(r).find(([k]) => /othe?r ?party/i.test(k))?.[1] ?? ''; return { date: iso(get(r, 'date')), amount: num(get(r, 'amount')), description: [party, get(r, 'description'), get(r, 'particulars'), get(r, 'code'), get(r, 'reference')].filter(Boolean).join(' '), vendor: party }; } },
  generic: { detect: () => true, map: (r) => { const date = iso(get(r, 'date', 'transactiondate', 'posted')); const amount = get(r, 'amount') ? num(get(r, 'amount')) : num(get(r, 'credit', 'deposit')) - num(get(r, 'debit', 'withdrawal')); const desc = get(r, 'description', 'details', 'narrative', 'memo', 'payee', 'merchant', 'transaction'); return date ? { date, amount, description: desc, vendor: get(r, 'payee', 'merchant') || desc } : null; } },
};

export const parseBankCsv = (text: string, forced?: string): { profile: string; rows: Row[]; skipped: number } => {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  const headers = parsed.meta.fields ?? [];
  const name = forced && PROFILES[forced] ? forced : Object.entries(PROFILES).find(([k, p]) => k !== 'generic' && p.detect(headers))?.[0] ?? 'generic';
  const rows: Row[] = []; let skipped = 0;
  for (const r of parsed.data) { const m = PROFILES[name]!.map(r); if (m && m.date && m.amount !== 0) rows.push({ ...m, vendor: (m.vendor || m.description).replace(/\s+/g, ' ').trim().slice(0, 80), description: m.description.replace(/\s+/g, ' ').trim().slice(0, 200) }); else skipped++; }
  return { profile: name, rows, skipped };
};

export const normalizeVendor = (v: string) => v.toLowerCase().replace(/paypal\s*\*|sq\s*\*|pp\*|\bcard\b.*$|\d{4,}|\b(nz|nzl|auckland|wellington|christchurch|us|usa|sg|au)\b/g, ' ').replace(/[^a-z& ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
