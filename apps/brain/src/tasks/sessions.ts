import { SessionPrepOutput, SessionTurnOutput, krProgress, type SessionType } from '@atlas/schemas';
import { col, now, listDocs, audit } from '../lib/firestore';
import { runTask } from '../lib/runner';
import { projectsLine, localNow, type UserContext } from '../lib/context';
import { sendText } from '../lib/whatsapp';
import { financeSnapshot } from './finance';

export const okrLines = async (uid: string) => {
  const [objs, krs, updates] = await Promise.all([
    listDocs(uid, 'objectives', (q) => q.where('status', '==', 'active')),
    listDocs(uid, 'keyResults'),
    listDocs(uid, 'krUpdates', (q) => q.orderBy('at', 'desc').limit(60)),
  ]);
  return objs.map((o: any) => {
    const lines = krs.filter((k: any) => k.objectiveId === o.id).map((k: any) => {
      const u = updates.filter((x: any) => x.keyResultId === k.id).slice(0, 3).map((x: any) => `${x.at.slice(0, 10)}: ${x.value}${x.confidence != null ? ' (conf ' + x.confidence + ')' : ''}`).join(', ');
      return `  - ${k.id} | ${k.title} | ${k.baseline} → ${k.target} ${k.unit ?? ''} | current ${k.current} (${Math.round(krProgress(k) * 100)}%) | confidence ${k.confidence}/10 | updates: ${u || 'none'}`;
    });
    return `${o.id} | ${o.title} (${o.quarter})\n${lines.join('\n') || '  (no key results)'}`;
  }).join('\n') || '(no objectives yet — propose some)';
};

const tasksLines = async (uid: string) => {
  const t = await listDocs(uid, 'tasks', (q) => q.where('column', 'in', ['thisWeek', 'inProgress', 'waitingOn']));
  return t.map((x: any) => `- [${x.column}] ${x.id} | ${x.title}${x.projectId ? ' (project ' + x.projectId + ')' : ''}${x.waitingOn ? ' waiting on ' + x.waitingOn : ''}${x.dueAt ? ' due ' + x.dueAt.slice(0, 10) : ''}`).join('\n') || '(nothing in flight)';
};

/** Prepare a session: brief + questions + proposed focus. Creates/updates the session doc. */
export const sessionPrep = async (ctx: UserContext, payload: { type: SessionType; sessionId?: string; channel?: 'whatsapp' | 'portal'; send?: boolean }) => {
  const last = (await listDocs(ctx.uid, 'sessions', (q) => q.where('status', '==', 'done').orderBy('completedAt', 'desc').limit(1)))[0] as any;
  let finance = '(no finance data)';
  try { const s = await financeSnapshot(ctx, {}); finance = `MTD spend $${s.spend}, run-rate $${s.runRate}/mo, unreviewed ${s.unreviewed}`; } catch { /* no ledger yet */ }
  const res = await runTask({
    ctx, task: 'session.prep', schema: SessionPrepOutput, cacheTtl: 3600,
    vars: { sessionType: payload.type, okrs: await okrLines(ctx.uid), projects: ctx.projects.map((p) => `${p.id} | ${p.name} | KRs: ${p.keyResultIds?.join(',') || (p.isMaintenance ? 'maintenance' : '⚠ UNLINKED')}`).join('\n'), tasks: await tasksLines(ctx.uid), lastSession: last ? `${last.type} on ${last.completedAt?.slice(0, 10)}: ${last.summary}` : '(none)', finance },
  });
  const channel = payload.channel ?? ctx.profile.okr.channel;
  const ref = payload.sessionId ? col(ctx.uid, 'sessions').doc(payload.sessionId) : col(ctx.uid, 'sessions').doc();
  await ref.set({ type: payload.type, scheduledFor: now(), channel, prep: res.output, status: 'prepared', transcript: [], decisions: [], actionsCreated: [], createdAt: now() }, { merge: true });
  if (payload.send && channel === 'whatsapp' && ctx.profile.whatsapp.number) {
    const q = res.output.questions.slice(0, payload.type === 'daily' ? 2 : 3).map((x, i) => `${i + 1}. ${x}`).join('\n');
    const focus = res.output.proposedFocus.slice(0, 3).map((f) => `• ${f.title}`).join('\n');
    await sendText(ctx.profile.whatsapp.number, `${res.output.headline}\n\n${res.output.brief.slice(0, 600)}\n\nProposed focus:\n${focus}\n\n${q}`, { quiet: ctx.profile.whatsapp.quietHours, force: true });
    await ref.set({ status: 'inProgress', startedAt: now(), transcript: [{ role: 'coach', content: res.output.headline + '\n' + q, at: now() }] }, { merge: true });
  }
  await audit(ctx.uid, { actor: 'brain', action: `prepared ${payload.type} session`, target: { collection: 'sessions', id: ref.id }, model: res.model });
  return { sessionId: ref.id, prep: res.output };
};

/** One conversational turn. Applies KR updates, creates tasks, closes when done. */
export const sessionTurn = async (ctx: UserContext, payload: { sessionId: string; message: string; via?: 'whatsapp' | 'portal' }) => {
  const ref = col(ctx.uid, 'sessions').doc(payload.sessionId);
  const s = (await ref.get()).data();
  if (!s) throw new Error('session not found');
  const transcript = [...(s.transcript ?? []), { role: 'user', content: payload.message, at: now() }];
  const res = await runTask({
    ctx, task: 'session.turn', schema: SessionTurnOutput, cacheTtl: 60,
    vars: { sessionType: s.type, prep: s.prep, okrs: await okrLines(ctx.uid), projects: projectsLine(ctx), transcript: transcript.map((t: any) => `${t.role}: ${t.content}`).join('\n'), message: payload.message },
  });
  const o = res.output;
  const actionsCreated: Array<{ taskId: string; title: string }> = [];
  for (const u of o.krUpdates) {
    const kref = col(ctx.uid, 'keyResults').doc(u.keyResultId);
    if (!(await kref.get()).exists) continue;
    const patch: Record<string, unknown> = { updatedAt: now() };
    if (u.value !== null) patch.current = u.value;
    if (u.confidence !== null) patch.confidence = u.confidence;
    await kref.set(patch, { merge: true });
    await col(ctx.uid, 'krUpdates').add({ keyResultId: u.keyResultId, value: u.value ?? (await kref.get()).data()?.current ?? 0, confidence: u.confidence, source: 'session', note: `session ${payload.sessionId}`, at: now() });
  }
  for (const t of o.tasks) {
    const tref = await col(ctx.uid, 'tasks').add({ title: t.title, projectId: t.projectId ?? undefined, column: t.column, order: Date.now(), priority: 'P1', sessionId: payload.sessionId, createdAt: now(), updatedAt: now() });
    actionsCreated.push({ taskId: tref.id, title: t.title });
  }
  transcript.push({ role: 'coach', content: o.reply, at: now() });
  await ref.set({ transcript, decisions: [...(s.decisions ?? []), ...o.decisions], actionsCreated: [...(s.actionsCreated ?? []), ...actionsCreated], status: o.done ? 'done' : 'inProgress', completedAt: o.done ? now() : undefined, summary: o.summary ?? s.summary ?? '' }, { merge: true });
  if (o.done && s.type === 'retro') {
    await col(ctx.uid, 'knowledge').add({ title: `Quarterly retro ${now().slice(0, 10)}`, tags: ['retro', 'okr'], source: 'retro', date: now().slice(0, 10), contentHash: payload.sessionId, excerpt: (o.summary ?? '').slice(0, 200), body: `${o.summary}\n\nDecisions:\n${[...(s.decisions ?? []), ...o.decisions].map((d: string) => '- ' + d).join('\n')}`, updatedAt: now() });
  }
  if ((payload.via ?? s.channel) === 'whatsapp' && ctx.profile.whatsapp.number) await sendText(ctx.profile.whatsapp.number, o.reply, { force: true });
  await audit(ctx.uid, { actor: 'brain', action: `session turn (${s.type})${o.done ? ' — closed' : ''}`, target: { collection: 'sessions', id: payload.sessionId }, model: res.model, reason: `${o.krUpdates.length} KR updates, ${actionsCreated.length} tasks` });
  return { reply: o.reply, done: o.done, krUpdates: o.krUpdates.length, tasks: actionsCreated };
};

/** Scheduler entry: start today's session if due (n8n calls this each morning per user). */
export const sessionStart = async (ctx: UserContext, payload: { type?: SessionType; force?: boolean }) => {
  const type = payload.type ?? 'daily';
  // Global cron fires hourly-ish for everyone; only start when it's the user's configured local hour.
  if (!payload.force) {
    const { hour, day } = localNow(ctx);
    const okr = ctx.profile.okr;
    if (type === 'daily' && (!okr.daily.enabled || Number(okr.daily.time.split(':')[0]) !== hour)) return { skipped: 'not this hour' };
    if (type === 'weekly' && (okr.weekly.day !== day || Number(okr.weekly.time.split(':')[0]) !== hour)) return { skipped: 'not this day/hour' };
  }
  const open = await listDocs(ctx.uid, 'sessions', (q) => q.where('status', 'in', ['prepared', 'inProgress']).where('type', '==', type));
  if (open.length) return { skipped: 'already open', sessionId: open[0]!.id };
  return sessionPrep(ctx, { type, send: true });
};
