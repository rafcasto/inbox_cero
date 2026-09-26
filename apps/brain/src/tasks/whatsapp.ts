import { WhatsAppCommandOutput, WhatsAppInbound, krProgress } from '@atlas/schemas';
import { col, now, listDocs, audit, storage } from '../lib/firestore';
import { runTask } from '../lib/runner';
import type { UserContext } from '../lib/context';
import { sendText, downloadMedia } from '../lib/whatsapp';
import { sha256 } from '../lib/crypto';
import { sessionTurn } from './sessions';
import { financeReceipt } from './finance';
import { todayText, statusText } from './digest';
import { askAnswer, pendingAsks } from './asks';

/** Handle one inbound WhatsApp message end to end. */
export const whatsappInbound = async (ctx: UserContext, payload: unknown) => {
  const m = WhatsAppInbound.parse(payload);
  const to = m.from;
  const say = (t: string) => sendText(to, t, { force: true });
  const dedupe = sha256(`${ctx.uid}|wa|${m.messageId}`);
  if ((await col(ctx.uid, 'items').doc(dedupe).get()).exists) return { skipped: 'duplicate' };

  // Media → store first
  let storagePath: string | undefined;
  if (m.mediaId && (m.type === 'image' || m.type === 'document')) {
    const { buffer, mime } = await downloadMedia(m.mediaId);
    storagePath = `users/${ctx.uid}/whatsapp/${m.messageId}.${mime.split('/')[1] ?? 'bin'}`;
    await storage().bucket().file(storagePath).save(buffer, { contentType: mime });
  }
  const text = m.text ?? m.caption ?? '';

  const active = (await listDocs(ctx.uid, 'sessions', (q) => q.where('status', '==', 'inProgress').limit(1)))[0] as any;
  const asks = await pendingAsks(ctx.uid);
  const [krs, tasks] = await Promise.all([listDocs(ctx.uid, 'keyResults'), listDocs(ctx.uid, 'tasks', (q) => q.where('column', 'in', ['thisWeek', 'inProgress', 'waitingOn', 'backlog']))]);
  const res = await runTask({
    ctx, task: 'whatsapp.inbound', schema: WhatsAppCommandOutput, cacheTtl: 30, refId: m.messageId,
    vars: {
      okrs: krs.map((k: any) => `${k.id} | ${k.title} | ${k.current}/${k.target} ${k.unit ?? ''} (${Math.round(krProgress(k) * 100)}%)`).join('\n'),
      tasks: tasks.map((t: any) => `${t.id} | ${t.title}`).join('\n'),
      activeSession: active ? `${active.type} session in progress; last coach message: ${active.transcript?.slice(-1)[0]?.content ?? ''}` : '(none)',
      asks: asks.map((a: any) => `${a.id} | ${a.question} | ${a.options.map((o: any) => `${o.key}=${o.label}`).join(', ')}`).join('\n') || '(none)',
      message: (storagePath ? `[${m.type} attached] ` : '') + (text || '(no text)'),
    },
  });
  const o = res.output;
  let result: Record<string, unknown> = { intent: o.intent };

  switch (o.intent) {
    case 'ask_reply': {
      const a = asks[0] as any;
      if (a) { const r = await askAnswer(ctx, { askId: a.id, answer: o.askOption ?? text.trim(), via: 'whatsapp' }); result = { ...result, ...r }; if ((r as any).error) o.reply = `Which option? ${a.options.map((x: any) => `${x.key}=${x.label}`).join(', ')}`; }
      break;
    }
    case 'session_reply': {
      if (!active) break;
      const r = await sessionTurn(ctx, { sessionId: active.id, message: text, via: 'whatsapp' });
      return { intent: 'session_reply', ...r };
    }
    case 'kr_update': {
      const kr = krs.find((k: any) => k.id === o.keyResultRef || k.title.toLowerCase().includes((o.keyResultRef ?? '').toLowerCase())) as any;
      if (kr && (o.value !== null || o.confidence !== null)) {
        const patch: Record<string, unknown> = { updatedAt: now() };
        if (o.value !== null) patch.current = o.value;
        if (o.confidence !== null) patch.confidence = o.confidence;
        await col(ctx.uid, 'keyResults').doc(kr.id).set(patch, { merge: true });
        await col(ctx.uid, 'krUpdates').add({ keyResultId: kr.id, value: o.value ?? kr.current, confidence: o.confidence, source: 'whatsapp', note: text, at: now() });
        result = { ...result, keyResultId: kr.id };
      } else o.reply = "I couldn't match that to a key result. Which one?";
      break;
    }
    case 'task_done': {
      const t = tasks.find((x: any) => x.title.toLowerCase().includes((o.text ?? '').toLowerCase())) as any;
      if (t) { await col(ctx.uid, 'tasks').doc(t.id).set({ column: 'done', completedAt: now(), updatedAt: now() }, { merge: true }); result = { ...result, taskId: t.id }; }
      else o.reply = `No open task matches "${o.text}".`;
      break;
    }
    case 'task_add': {
      const ref = await col(ctx.uid, 'tasks').add({ title: o.text ?? text, column: 'backlog', order: Date.now(), priority: 'P2', createdAt: now(), updatedAt: now(), sourceItemId: dedupe });
      result = { ...result, taskId: ref.id };
      break;
    }
    case 'idea': {
      const ref = await col(ctx.uid, 'content').add({ platform: 'linkedin', stage: 'idea', title: (o.text ?? text).slice(0, 80), body: o.text ?? text, seeds: [{ type: 'manual', refId: dedupe }], createdAt: now(), updatedAt: now() });
      result = { ...result, contentId: ref.id };
      break;
    }
    case 'receipt': {
      const r = await financeReceipt(ctx, { text: text || 'receipt photo (no caption)', storagePath });
      result = { ...result, ...r };
      break;
    }
    case 'today': o.reply = await todayText(ctx); break;
    case 'status': o.reply = await statusText(ctx); break;
    default: break;
  }
  await col(ctx.uid, 'items').doc(dedupe).set({
    userId: ctx.uid, source: { type: 'whatsapp', integrationId: 'whatsapp', externalId: m.messageId }, dedupeKey: dedupe,
    receivedAt: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(), ingestedAt: now(),
    raw: { snippet: text.slice(0, 600), storagePath, from: m.from }, summary: text.slice(0, 200),
    status: ['capture', 'unknown'].includes(o.intent) ? 'new' : 'filed', tags: ['whatsapp', o.intent], intent: o.intent,
  });
  await say(o.reply);
  await audit(ctx.uid, { actor: 'brain', action: `whatsapp: ${o.intent}`, target: { collection: 'items', id: dedupe }, model: res.model });
  return result;
};
