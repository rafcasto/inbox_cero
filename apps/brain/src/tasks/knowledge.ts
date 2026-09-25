import { z } from 'zod';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import YAML from 'yaml';
import { col, now, listDocs, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';
import { sha256 } from '../lib/crypto';

const Keywords = z.object({ summary: z.string().max(300), keywords: z.array(z.string()).max(12) });

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); if (f.startsWith('.') || f === 'node_modules') return []; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : []; });

/** Index a markdown repo (payload.dir) or a single note (payload.note) into users/{uid}/knowledge with brain-generated keywords. */
export const knowledgeIndex = async (ctx: UserContext, payload: { dir?: string; note?: { title: string; body: string; tags?: string[] }; id?: string }) => {
  const docs: Array<{ id: string; title: string; tags: string[]; source: 'repo' | 'note'; date?: string; path?: string; body: string }> = [];
  if (payload.dir) {
    for (const p of walk(payload.dir)) {
      const raw = readFileSync(p, 'utf8');
      const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const fm = m ? (YAML.parse(m[1]!) as Record<string, any>) : {};
      const rel = relative(payload.dir, p);
      docs.push({ id: sha256(`${ctx.uid}|repo|${rel}`), title: fm.title ?? rel.replace(/\.md$/, ''), tags: fm.tags ?? [], source: 'repo', date: fm.date ? String(fm.date) : undefined, path: rel, body: m ? m[2]! : raw });
    }
  }
  if (payload.note) docs.push({ id: payload.id ?? sha256(`${ctx.uid}|note|${payload.note.title}|${Date.now()}`), title: payload.note.title, tags: payload.note.tags ?? [], source: 'note', body: payload.note.body });
  const existing = new Map((await listDocs(ctx.uid, 'knowledge')).map((k: any) => [k.id, k.contentHash]));
  let indexed = 0;
  for (const d of docs) {
    const hash = sha256(d.body);
    if (existing.get(d.id) === hash) continue;
    let summary = d.body.slice(0, 200); let keywords: string[] = d.tags;
    try {
      const r = await runTask({ ctx, task: 'summaries', schema: Keywords, cacheTtl: 86400 * 30, vars: { text: `Return JSON {"summary": ≤40 words, "keywords": up to 12 lowercase single words or short phrases for search}.\n\n# ${d.title}\n${d.body.slice(0, 6000)}` } });
      summary = r.output.summary; keywords = [...new Set([...d.tags, ...r.output.keywords.map((k) => k.toLowerCase())])];
    } catch { /* keep fallback */ }
    await col(ctx.uid, 'knowledge').doc(d.id).set({ title: d.title, tags: d.tags, keywords, source: d.source, date: d.date, path: d.path, contentHash: hash, excerpt: summary, body: d.body.slice(0, 200_000), updatedAt: now() }, { merge: true });
    indexed++;
  }
  await audit(ctx.uid, { actor: 'brain', action: `indexed ${indexed} knowledge doc(s)` });
  return { indexed, total: docs.length };
};
