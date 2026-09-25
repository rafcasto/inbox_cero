import { ContentDraftOutput, type Platform } from '@atlas/schemas';
import { col, now, listDocs, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';

/** Draft posts from seeds (content ids, item ids, knowledge ids, or free text). Never publishes. */
export const contentDraft = async (ctx: UserContext, payload: { platforms: Platform[]; seeds?: Array<{ type: string; refId?: string; text?: string }>; contentId?: string }) => {
  const seedTexts: string[] = [];
  for (const s of payload.seeds ?? []) {
    if (s.text) seedTexts.push(`- (${s.type}) ${s.text}`);
    else if (s.refId) {
      const collection = s.type === 'knowledge' ? 'knowledge' : s.type === 'content' ? 'content' : 'items';
      const d = (await col(ctx.uid, collection).doc(s.refId).get()).data();
      if (d) seedTexts.push(`- (${s.type}) ${d.title ?? d.raw?.subject ?? ''}: ${(d.body ?? d.summary ?? d.raw?.snippet ?? '').slice(0, 800)}`);
    }
  }
  if (payload.contentId) {
    const c = (await col(ctx.uid, 'content').doc(payload.contentId).get()).data();
    if (c) seedTexts.unshift(`- (idea) ${c.title}: ${c.body}`);
  }
  const tags = new Set(seedTexts.join(' ').toLowerCase().split(/\W+/).filter((w) => w.length > 5).slice(0, 20));
  const kb = (await listDocs(ctx.uid, 'knowledge', (q) => q.limit(200))).filter((k: any) => (k.keywords ?? k.tags ?? []).some((t: string) => tags.has(String(t).toLowerCase()))).slice(0, 5);
  const res = await runTask({
    ctx, task: 'content.draft', schema: ContentDraftOutput, refId: payload.contentId,
    vars: { voice: ctx.profile.voice, examples: ctx.profile.voice.examples.map((e) => `[${e.platform}] ${e.text}`).join('\n\n'), seeds: seedTexts.join('\n'), knowledge: kb.map((k: any) => `## ${k.title}\n${k.excerpt ?? k.body?.slice(0, 600)}`).join('\n\n'), platforms: payload.platforms.join(', ') },
  });
  const ids: string[] = [];
  for (const d of res.output.drafts) {
    const ref = payload.contentId && res.output.drafts.length === 1 ? col(ctx.uid, 'content').doc(payload.contentId) : col(ctx.uid, 'content').doc();
    await ref.set({ platform: d.platform, stage: 'draft', title: d.title, body: d.body, hook: d.hook, why: d.why, seeds: payload.seeds ?? [], updatedAt: now(), createdAt: now(), draftedBy: res.model }, { merge: true });
    ids.push(ref.id);
  }
  await audit(ctx.uid, { actor: 'brain', action: `drafted ${ids.length} content piece(s)`, model: res.model });
  return { contentIds: ids };
};
