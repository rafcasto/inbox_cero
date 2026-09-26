import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { TriageInputItem } from '@atlas/schemas';
import { col, now, audit } from '../lib/firestore';
import { open as unseal, sha256 } from '../lib/crypto';
import { log } from '../lib/log';
import type { UserContext } from '../lib/context';
import { triageItems } from './triage';

type ImapIntegration = {
  id: string; type: 'imap'; enabled: boolean; label: string; provider?: 'gmail';
  config: { host: string; port: number; secure: boolean; user: string; auth?: 'password' | 'xoauth2'; pollFolder: string; filedFolder: string; ignoredFolder: string; maxPerPoll?: number };
  secret: { v: 1; iv: string; tag: string; data: string };
  cursor?: { lastUid?: number; uidValidity?: number };
};

const accessTokenCache = new Map<string, { token: string; exp: number }>();
/** Google refresh-token → short-lived access token for IMAP XOAUTH2 (cached ~50 min). */
const googleAccessToken = async (integrationId: string, refreshToken: string) => {
  const hit = accessTokenCache.get(integrationId);
  if (hit && hit.exp > Date.now()) return hit.token;
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID, secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) throw new Error('GOOGLE_OAUTH_CLIENT_ID/SECRET not set on the Pi');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refreshToken, grant_type: 'refresh_token' }) });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!r.ok || !j.access_token) throw new Error(`google token refresh failed: ${j.error_description ?? j.error ?? r.status}`);
  accessTokenCache.set(integrationId, { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 600) * 1000 });
  return j.access_token;
};

const connect = async (i: ImapIntegration) => {
  const secret = unseal(i.secret);
  const auth = i.config.auth === 'xoauth2' ? { user: i.config.user, accessToken: await googleAccessToken(i.id, secret) } : { user: i.config.user, pass: secret };
  const client = new ImapFlow({ host: i.config.host, port: i.config.port ?? 993, secure: i.config.secure ?? true, auth, logger: false });
  await client.connect();
  return client;
};

const ensureFolder = async (client: ImapFlow, path: string) => {
  try { await client.mailboxCreate(path); } catch { /* exists */ }
};

/** Poll one user's IMAP integrations for new mail since the stored UID cursor; normalise; triage. */
export const emailPoll = async (ctx: UserContext, payload: { integrationId?: string }) => {
  const q = col(ctx.uid, 'integrations').where('type', '==', 'imap').where('enabled', '==', true);
  const snap = await q.get();
  const integrations = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ImapIntegration, 'id'>) }))
    .filter((i) => !payload.integrationId || i.id === payload.integrationId);
  const summary: Record<string, unknown> = {};
  for (const i of integrations) {
    try {
      summary[i.id] = await pollOne(ctx, i as ImapIntegration);
    } catch (e) {
      log.error('imap poll failed', { uid: ctx.uid, integration: i.id, err: String(e) });
      await col(ctx.uid, 'integrations').doc(i.id).set({ lastError: String(e).slice(0, 300), lastErrorAt: now() }, { merge: true });
      summary[i.id] = { error: String(e).slice(0, 200) };
    }
  }
  return summary;
};

const pollOne = async (ctx: UserContext, i: ImapIntegration) => {
  const client = await connect(i);
  const folder = i.config.pollFolder || 'INBOX';
  const max = i.config.maxPerPoll ?? 25;
  const items: TriageInputItem[] = [];
  const meta: Record<string, { receivedAt: string; storageText: string; uid: number }> = {};
  let lastUid = i.cursor?.lastUid ?? 0;
  try {
    const box = await client.mailboxOpen(folder);
    if (i.cursor?.uidValidity && Number(i.cursor.uidValidity) !== Number(box.uidValidity)) lastUid = 0; // mailbox reset
    const range = lastUid > 0 ? `${lastUid + 1}:*` : '1:*';
    const uids = (await client.search({ uid: range, seen: false }, { uid: true })) as number[];
    const pick = uids.filter((u) => u > lastUid).sort((a, b) => a - b).slice(0, max);
    for await (const msg of client.fetch(pick, { uid: true, envelope: true, source: true, headers: ['list-unsubscribe'] }, { uid: true })) {
      const parsed = await simpleParser(msg.source!);
      const text = (parsed.text ?? (typeof parsed.html === 'string' ? parsed.html.replace(/<[^>]+>/g, ' ') : '')).replace(/\s+/g, ' ').trim();
      const externalId = parsed.messageId ?? `${Number(box.uidValidity)}-${msg.uid}`;
      const id = sha256(`${ctx.uid}|email|${i.id}|${externalId}`);
      const existing = await col(ctx.uid, 'items').doc(id).get();
      lastUid = Math.max(lastUid, msg.uid);
      if (existing.exists) continue;
      items.push(TriageInputItem.parse({
        id,
        from: parsed.from?.text ?? '',
        to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to.text) : '',
        subject: parsed.subject ?? '',
        receivedAt: (parsed.date ?? new Date()).toISOString(),
        snippet: text.slice(0, 4000),
        hasListUnsubscribe: Boolean(parsed.headers.get('list-unsubscribe')),
        source: 'email',
      }));
      meta[id] = { receivedAt: (parsed.date ?? new Date()).toISOString(), storageText: text.slice(0, 50_000), uid: msg.uid };
    }
    await client.mailboxClose();
    await col(ctx.uid, 'integrations').doc(i.id).set({ cursor: { lastUid, uidValidity: Number(box.uidValidity) }, lastSyncAt: now(), lastError: null }, { merge: true });
  } finally {
    await client.logout().catch(() => {});
  }
  if (!items.length) return { new: 0 };
  // Write raw items first (status=new) so nothing is lost if triage fails
  const batch = col(ctx.uid, 'items').firestore.batch();
  for (const it of items) {
    batch.set(col(ctx.uid, 'items').doc(it.id), {
      userId: ctx.uid,
      source: { type: 'email', integrationId: i.id, externalId: it.id, imapUid: meta[it.id]!.uid, folder },
      dedupeKey: it.id,
      receivedAt: it.receivedAt,
      ingestedAt: now(),
      raw: { subject: it.subject, from: it.from, to: it.to, snippet: it.snippet.slice(0, 600), body: meta[it.id]!.storageText, hasListUnsubscribe: it.hasListUnsubscribe },
      summary: '',
      status: 'new',
      tags: [],
      integrationId: i.id,
    });
  }
  await batch.commit();
  const t = await triageItems(ctx, { items });
  // Auto-file ignored/filed mail into folders so the mailbox mirrors Atlas
  const acts = t.results.filter((r) => r.autoAct);
  if (acts.length) await emailAct(ctx, { integrationId: i.id, actions: acts.map((r) => ({ itemId: r.id, action: r.action })) });
  await audit(ctx.uid, { actor: 'brain', action: `polled ${i.label || i.id}`, reason: `${items.length} new, ${acts.length} auto-filed` });
  return { new: items.length, autoFiled: acts.length, triaged: t.results.length };
};

/** Mirror an Inbox decision into the mailbox: file → filedFolder, ignore → ignoredFolder (+ mark seen). */
export const emailAct = async (ctx: UserContext, payload: { integrationId?: string; actions: Array<{ itemId: string; action: string }> }) => {
  if (!payload.integrationId) { const first = (await col(ctx.uid, 'items').doc(payload.actions[0]!.itemId).get()).data(); payload.integrationId = first?.integrationId ?? first?.source?.integrationId; }
  const iSnap = await col(ctx.uid, 'integrations').doc(String(payload.integrationId)).get();
  if (!iSnap.exists) throw new Error('integration not found');
  const i = { id: iSnap.id, ...(iSnap.data() as Omit<ImapIntegration, 'id'>) } as ImapIntegration;
  const client = await connect(i);
  const results: Record<string, string> = {};
  try {
    await client.mailboxOpen(i.config.pollFolder || 'INBOX');
    for (const a of payload.actions) {
      const item = (await col(ctx.uid, 'items').doc(a.itemId).get()).data();
      const uid = item?.source?.imapUid as number | undefined;
      if (!uid) { results[a.itemId] = 'no-uid'; continue; }
      const target = a.action === 'ignore' ? (i.config.ignoredFolder || 'Atlas/Ignored') : a.action === 'file' ? (i.config.filedFolder || 'Atlas/Filed') : null;
      if (target) {
        await ensureFolder(client, target);
        await client.messageFlagsAdd({ uid: String(uid) }, ['\\Seen'], { uid: true });
        await client.messageMove({ uid: String(uid) }, target, { uid: true });
        results[a.itemId] = `moved:${target}`;
        await col(ctx.uid, 'items').doc(a.itemId).set({ status: a.action === 'ignore' ? 'ignored' : 'filed' }, { merge: true });
      } else {
        await client.messageFlagsAdd({ uid: String(uid) }, ['\\Flagged'], { uid: true });
        results[a.itemId] = 'flagged';
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return results;
};
