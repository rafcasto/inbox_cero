import { DigestPlan, DigestOutput } from '@atlas/schemas';
import { col, now, listDocs, userRef } from '../lib/firestore';
import { runTask } from '../lib/runner';
import { todaysEvents, fmtEvents } from '../lib/calendar';
import { sendToSelf } from '../lib/mailer';
import { sendText } from '../lib/whatsapp';
import { runAs } from '../lib/runas';
import { drive } from '../lib/drive';
import { event } from '../lib/events';
import { financeSnapshot } from './finance';
import type { UserContext } from '../lib/context';

/**
 * digest.compose — the Daily Digest. Two model passes: (1) headers+snippets only for ≤50 threads → plan + up to 5
 * body requests; (2) compose with those bodies, today's calendar, yesterday's events, finance, pending asks.
 * Delivery: inbox/ (Pi + Drive), email to self, WhatsApp one-liner — per the automation's channels.
 */
export const digestCompose = async (ctx: UserContext, payload: { channels?: string[]; maxThreads?: number; maxBodies?: number; dryRun?: boolean }) => {
  const channels = payload.channels ?? ['inbox', 'email'];
  const maxThreads = Math.min(50, payload.maxThreads ?? 50);
  const maxBodies = Math.min(5, payload.maxBodies ?? 5);
  const tz = ctx.timezone;
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const date = new Intl.DateTimeFormat('en-NZ', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  // 1. Mail: last 24 h, from the already-ingested items (privacy filter and 72 h window already applied). Cap 50, newest first.
  const items = (await listDocs(ctx.uid, 'items', (q) => q.where('receivedAt', '>=', since).orderBy('receivedAt', 'desc').limit(200)))
    .filter((i: any) => i.source?.type === 'email').slice(0, maxThreads) as any[];
  const threads = items.map((i) => ({ id: i.id, from: String(i.raw?.from ?? '').replace(/<.*>/, '').trim(), subject: i.raw?.subject ?? '', snippet: String(i.summary || i.raw?.snippet || '').slice(0, 220), status: i.status, priority: i.triage?.priority ?? null }));
  const cal = await todaysEvents(ctx.uid, tz);
  const calendar = fmtEvents(cal.events, tz) + (cal.missingScope.length ? `\n(no calendar access for: ${cal.missingScope.join(', ')} — reconnect in Settings to grant it)` : '');
  const yEvents = (await listDocs(ctx.uid, 'audit', (q) => q.where('at', '>=', since).orderBy('at', 'desc').limit(200))).filter((e: any) => e.actor === 'brain');
  const byType: Record<string, number> = {}; for (const e of yEvents as any[]) byType[e.actionType ?? 'system'] = (byType[e.actionType ?? 'system'] ?? 0) + 1;
  const eventsText = Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ') + '\n' + (yEvents as any[]).slice(0, 12).map((e) => `- ${e.action}`).join('\n');

  // Pass 1: plan from headers only
  const plan = await runTask({ ctx, task: 'digest.plan', schema: DigestPlan, cacheTtl: 1800, vars: { window: 24, count: threads.length, threads, calendar, events: eventsText } });
  const wanted = plan.output.requestBodies.slice(0, maxBodies);
  const bodies = wanted.map((id) => { const it = items.find((x) => x.id === id); return it ? `### ${it.raw?.subject}\nFrom: ${it.raw?.from}\n\n${String(it.raw?.body ?? it.raw?.snippet ?? '').slice(0, 4000)}` : ''; }).filter(Boolean).join('\n\n---\n\n') || '(none requested)';

  // Pass 2: compose
  let finance = '(no ledger yet)';
  try { const s = await financeSnapshot(ctx, {}); finance = `MTD spend $${s.spend}, run-rate $${s.runRate}/mo, ${s.unreviewed} unreviewed`; } catch { /* none */ }
  const asks = (await listDocs(ctx.uid, 'asks', (q) => q.where('status', '==', 'pending').limit(5))).map((a: any) => `- ${a.question}`).join('\n') || '(none)';
  const out = await runTask({ ctx, task: 'digest.compose', schema: DigestOutput, cacheTtl: 1800, vars: { date, plan: plan.output, bodies, calendar, events: eventsText, finance, asks } });
  const md = out.output.markdown.trim() + `\n\n---\n_Atlas · ${threads.length} threads scanned, ${wanted.length} read in full, ${cal.events.length} calendar events, ${yEvents.length} actions yesterday._\n`;
  const fileName = `digest-${now().slice(0, 10)}.md`;
  const delivered: Record<string, unknown> = {};
  if (payload.dryRun) return { markdown: md, oneLiner: out.output.oneLiner, actions: out.output.actions, delivered: 'dryRun' };

  // Deliver
  const prov = ((await userRef(ctx.uid).get()).data() ?? {}).provisioning ?? {};
  if (channels.includes('inbox') && prov.slug && prov.projectsPath) {
    const r = await runAs(prov.slug, prov.projectsPath, ['sh', '-c', 'cat > "inbox/$1"', 'sh', fileName], { stdin: md });
    delivered.inbox = r.code === 0 ? `${prov.projectsPath}/inbox/${fileName}` : `failed: ${r.stderr.slice(0, 120)}`;
    if (prov.driveInboxFolderId) { try { const f = await drive.upload(prov.driveInboxFolderId, fileName, Buffer.from(md), 'text/markdown'); delivered.drive = f.id; await col(ctx.uid, 'driveFiles').doc(f.id).set({ id: f.id, name: fileName, path: `${prov.projectsPath}/inbox/${fileName}`, md5: f.md5Checksum ?? null, modifiedTime: f.modifiedTime ?? now(), folderId: prov.driveInboxFolderId, pushedAt: now() }); } catch (e) { delivered.drive = `failed: ${String(e).slice(0, 100)}`; } }
  }
  if (channels.includes('email')) { try { delivered.email = await sendToSelf(ctx.uid, `Atlas digest — ${date}`, md, mdToHtml(md)); } catch (e) { delivered.email = `failed: ${String(e).slice(0, 160)}`; } }
  if (channels.includes('whatsapp') && ctx.profile.whatsapp.number) { try { delivered.whatsapp = await sendText(ctx.profile.whatsapp.number, `☀️ ${out.output.oneLiner}`, { quiet: ctx.profile.whatsapp.quietHours, tz }); } catch (e) { delivered.whatsapp = `failed: ${String(e).slice(0, 100)}`; } }
  const ref = await col(ctx.uid, 'digests').add({ date: now().slice(0, 10), markdown: md, oneLiner: out.output.oneLiner, actions: out.output.actions, threads: threads.length, bodies: wanted.length, calendarEvents: cal.events.length, delivered, at: now(), model: out.model });
  await event(ctx.uid, { actionType: 'job.run', action: `daily digest: ${plan.output.headline}`, ref: ref.id, reason: JSON.stringify(delivered).slice(0, 200), costUsd: plan.costUsd + out.costUsd });
  return { digestId: ref.id, headline: plan.output.headline, threads: threads.length, bodies: wanted.length, calendarEvents: cal.events.length, delivered };
};

const mdToHtml = (md: string) => `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;line-height:1.5">${md
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/^# (.*)$/gm, '<h1 style="font-size:20px">$1</h1>').replace(/^## (.*)$/gm, '<h2 style="font-size:15px;margin-top:20px">$1</h2>')
  .replace(/^\- (.*)$/gm, '<li>$1</li>').replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/_(.*?)_/g, '<em>$1</em>').replace(/^---$/gm, '<hr/>').replace(/\n{2,}/g, '<br/>')}</div>`;
