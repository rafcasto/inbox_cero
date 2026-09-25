import { col, now, listDocs, audit } from '../lib/firestore';
import type { UserContext } from '../lib/context';
import { financeSnapshot } from './finance';

/** Auto-update KRs from linked data (ledger totals, tasks completed, content published). */
export const krAutoUpdate = async (ctx: UserContext) => {
  const krs = (await listDocs(ctx.uid, 'keyResults')).filter((k: any) => k.autoSource && k.autoSource.type !== 'manual') as any[];
  let updated = 0;
  const month = now().slice(0, 7);
  for (const k of krs) {
    let value: number | null = null;
    const cfg = k.autoSource.config ?? {};
    if (k.autoSource.type === 'ledgerCategoryTotal') {
      const s = await financeSnapshot(ctx, { month: cfg.month ?? month });
      value = cfg.categoryId ? (s.byCategory[cfg.categoryId] ?? 0) : s.spend;
    } else if (k.autoSource.type === 'tasksCompleted') {
      const t = await listDocs(ctx.uid, 'tasks', (q) => q.where('column', '==', 'done'));
      value = t.filter((x: any) => (!cfg.projectId || x.projectId === cfg.projectId) && (!cfg.since || (x.completedAt ?? '') >= cfg.since)).length;
    } else if (k.autoSource.type === 'contentPublished') {
      const c = await listDocs(ctx.uid, 'content', (q) => q.where('stage', '==', 'published'));
      value = c.filter((x: any) => (!cfg.platform || x.platform === cfg.platform) && (!cfg.since || (x.publishedAt ?? '') >= cfg.since)).length;
    }
    if (value === null || value === k.current) continue;
    await col(ctx.uid, 'keyResults').doc(k.id).set({ current: value, updatedAt: now() }, { merge: true });
    await col(ctx.uid, 'krUpdates').add({ keyResultId: k.id, value, source: 'auto', note: k.autoSource.type, at: now() });
    updated++;
  }
  if (updated) await audit(ctx.uid, { actor: 'brain', action: `auto-updated ${updated} key result(s)` });
  return { updated };
};

/** Governance flags: projects serving no objective, KRs stale > 14 days, objectives with no KRs. Stored in users/{uid}/flags. */
export const governanceFlags = async (ctx: UserContext) => {
  const [krs, objs] = await Promise.all([listDocs(ctx.uid, 'keyResults'), listDocs(ctx.uid, 'objectives', (q) => q.where('status', '==', 'active'))]);
  const flags: Array<{ id: string; type: string; message: string; ref: { collection: string; id: string } }> = [];
  for (const p of ctx.projects) if (!p.isMaintenance && !(p.keyResultIds?.length)) flags.push({ id: `unlinked-${p.id}`, type: 'unlinkedProject', message: `"${p.name}" isn't serving any objective — keep, link or kill?`, ref: { collection: 'projects', id: p.id } });
  const stale = new Date(Date.now() - 14 * 86400e3).toISOString();
  for (const k of krs as any[]) if ((k.updatedAt ?? '') < stale) flags.push({ id: `stale-${k.id}`, type: 'staleKr', message: `"${k.title}" hasn't been updated in 2+ weeks.`, ref: { collection: 'keyResults', id: k.id } });
  for (const o of objs as any[]) if (!krs.some((k: any) => k.objectiveId === o.id)) flags.push({ id: `nokr-${o.id}`, type: 'objectiveNoKrs', message: `"${o.title}" has no measurable key results.`, ref: { collection: 'objectives', id: o.id } });
  const existing = await listDocs(ctx.uid, 'flags');
  const batch = col(ctx.uid, 'flags').firestore.batch();
  for (const e of existing) if (!flags.some((f) => f.id === e.id)) batch.delete(col(ctx.uid, 'flags').doc(e.id));
  for (const f of flags) batch.set(col(ctx.uid, 'flags').doc(f.id), { ...f, updatedAt: now() }, { merge: true });
  await batch.commit();
  return { flags: flags.length };
};
