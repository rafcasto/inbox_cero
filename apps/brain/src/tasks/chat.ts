import { col, userRef, now, logUsage } from '../lib/firestore';
import { runAsStream, runAs } from '../lib/runas';
import { resolveModel } from '../lib/runner';
import { event } from '../lib/events';
import type { UserContext } from '../lib/context';

const prov = async (uid: string) => { const p = ((await userRef(uid).get()).data() ?? {}).provisioning ?? {}; if (!p.slug || !p.projectsPath) throw new Error('user is not provisioned on the Pi yet'); return p as { slug: string; projectsPath: string }; };
const short = (v: unknown, n = 400) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

/**
 * project.chat — one interactive turn, streamed. Runs `claude -p --output-format stream-json --include-partial-messages`
 * as the user inside the project dir, resuming the chat's session. Text deltas are throttled into the assistant message
 * doc; every tool_use becomes its own message doc (updated with the result); the final `result` closes the turn.
 */
export const projectChat = async (ctx: UserContext, payload: { projectId: string; chatId?: string; message: string; model?: string; fresh?: boolean }) => {
  const p = await prov(ctx.uid);
  const proj = (await col(ctx.uid, 'projects').doc(payload.projectId).get()).data();
  if (!proj?.path) throw new Error('project has no directory yet');
  const chats = col(ctx.uid, 'chats');
  const chatRef = payload.chatId ? chats.doc(payload.chatId) : chats.doc();
  let chat = (await chatRef.get()).data();
  if (!chat) { chat = { projectId: payload.projectId, title: payload.message.slice(0, 60), sessionId: null, status: 'idle', createdAt: now(), updatedAt: now(), turns: 0, costUsd: 0 }; await chatRef.set(chat); }
  const msgs = chatRef.collection('messages');
  let seq = (chat.turns ?? 0) * 100;
  // user message may already exist (portal writes it optimistically); write one if the last message isn't this text
  const last = await msgs.orderBy('seq', 'desc').limit(1).get();
  if (!last.docs[0] || last.docs[0].data().role !== 'user' || last.docs[0].data().content !== payload.message) await msgs.add({ role: 'user', content: payload.message, status: 'done', seq: ++seq, at: now() });
  else seq = last.docs[0].data().seq;
  const asstRef = msgs.doc(); let text = ''; let lastFlush = 0; let flushTimer: NodeJS.Timeout | null = null;
  await asstRef.set({ role: 'assistant', content: '', status: 'streaming', seq: ++seq, at: now() });
  await chatRef.set({ status: 'running', updatedAt: now() }, { merge: true });
  const flush = async (force = false) => { if (!force && Date.now() - lastFlush < 400) { if (!flushTimer) flushTimer = setTimeout(() => { flushTimer = null; flush(true); }, 450); return; } lastFlush = Date.now(); await asstRef.set({ content: text }, { merge: true }); };
  const tools = new Map<string, FirebaseFirestore.DocumentReference>();
  const model = resolveModel(ctx, 'sessions', payload.model);
  const args = ['claude', '-p', payload.message, '--model', model, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--max-turns', '25', '--strict-mcp-config', '--setting-sources', 'user,project', '--permission-mode', 'acceptEdits'];
  if (chat.sessionId && !payload.fresh) args.push('--resume', chat.sessionId);
  const t0 = Date.now(); let result: any = null; let sessionId: string | null = chat.sessionId ?? null;
  const r = await runAsStream(p.slug, proj.path, args, async (line) => {
    let ev: any; try { ev = JSON.parse(line); } catch { return; }
    if (ev.type === 'system' && ev.session_id) sessionId = ev.session_id;
    if (ev.type === 'stream_event') {
      const e = ev.event;
      if (e?.type === 'content_block_delta' && e.delta?.type === 'text_delta') { text += e.delta.text; await flush(); }
      return;
    }
    if (ev.type === 'assistant') {
      for (const b of ev.message?.content ?? []) {
        if (b.type === 'tool_use') { const ref = msgs.doc(); tools.set(b.id, ref); await ref.set({ role: 'tool', toolName: b.name, toolInput: short(b.input, 600), content: '', status: 'streaming', seq: ++seq, at: now() }); if (text) { await flush(true); } }
        if (b.type === 'text' && !text) { text = b.text ?? ''; await flush(true); }
      }
      // A new assistant text block after tools → continue in a fresh assistant bubble
      if ((ev.message?.content ?? []).some((b: any) => b.type === 'tool_use') && text) { await asstRef.set({ content: text, status: 'done' }, { merge: true }); }
    }
    if (ev.type === 'user') {
      for (const b of ev.message?.content ?? []) if (b.type === 'tool_result') { const ref = tools.get(b.tool_use_id); if (ref) await ref.set({ status: 'done', toolOk: !b.is_error, toolResult: short(Array.isArray(b.content) ? b.content.map((c: any) => c.text ?? '').join('\n') : b.content, 800) }, { merge: true }); }
    }
    if (ev.type === 'result') result = ev;
  });
  if (flushTimer) clearTimeout(flushTimer);
  const ok = r.code === 0 && result && !result.is_error;
  const finalText = (result?.result && String(result.result).trim()) || text;
  await asstRef.set({ content: finalText || (ok ? '(no text)' : `Error: ${short(result?.result ?? r.stderr ?? 'failed', 300)}`), status: ok ? 'done' : 'error', costUsd: Number(result?.total_cost_usd ?? 0), durationMs: Date.now() - t0, model: Object.keys(result?.modelUsage ?? {})[0] ?? model }, { merge: true });
  await chatRef.set({ status: ok ? 'idle' : 'error', sessionId: sessionId ?? result?.session_id ?? null, updatedAt: now(), turns: (chat.turns ?? 0) + 1, costUsd: (chat.costUsd ?? 0) + Number(result?.total_cost_usd ?? 0), title: chat.title === 'New conversation' ? payload.message.slice(0, 60) : chat.title }, { merge: true });
  if (sessionId) await col(ctx.uid, 'projects').doc(payload.projectId).set({ claudeSessionId: sessionId, lastRunAt: now() }, { merge: true });
  if (result?.usage) await logUsage(ctx.uid, { task: 'project.chat', model, tokensIn: (result.usage.input_tokens ?? 0) + (result.usage.cache_creation_input_tokens ?? 0) + (result.usage.cache_read_input_tokens ?? 0), tokensOut: result.usage.output_tokens ?? 0, costUsd: Number(result.total_cost_usd ?? 0), refId: chatRef.id });
  await event(ctx.uid, { actionType: 'agent.run', action: `chat in "${proj.name}": ${payload.message.slice(0, 70)}`, projectId: payload.projectId, ref: chatRef.id, costUsd: Number(result?.total_cost_usd ?? 0), model, approval: 'user', reason: `${tools.size} tool call(s)` });
  return { chatId: chatRef.id, ok, sessionId, tools: tools.size, costUsd: Number(result?.total_cost_usd ?? 0) };
};

/** file.put — drop a small file (≤ 900 KB, base64) into a project dir as the user (chat attachments). */
export const filePut = async (ctx: UserContext, payload: { projectId: string; name: string; contentB64: string }) => {
  const p = await prov(ctx.uid);
  const dir = payload.projectId === 'inbox' ? `${p.projectsPath}/inbox` : ((await col(ctx.uid, 'projects').doc(payload.projectId).get()).data()?.path as string | undefined);
  if (!dir) throw new Error('project has no directory yet');
  const name = payload.name.replace(/[\/\\\0]/g, '_').replace(/^\.+/, '_').slice(0, 120);
  if (payload.contentB64.length > 1_250_000) throw new Error('attachment too large (900 KB max via chat; use Drive for bigger files)');
  const r = await runAs(p.slug, p.projectsPath, ['sh', '-c', 'base64 -d > "$1/$2"', 'sh', dir, name], { stdin: payload.contentB64 });
  if (r.code !== 0) throw new Error(r.stderr.slice(0, 200));
  await event(ctx.uid, { actionType: 'file.push', action: `attached ${name}`, projectId: payload.projectId === 'inbox' ? null : payload.projectId, ref: `${dir}/${name}` });
  return { path: `${dir}/${name}` };
};
