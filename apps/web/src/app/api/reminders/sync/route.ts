import { adminDb, handle, nowIso, HttpError, audit } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';
import { ReminderPush } from '@atlas/schemas';
import { createHash } from 'node:crypto';

/**
 * iPhone Shortcut endpoint. POST { token, reminders:[...] } — upserts reminders as Items (new ones get triaged)
 * and returns { create:[{id,title,due,notes}], complete:[externalId] } for the Shortcut to apply on the phone.
 */
export const POST = handle(async (req) => {
  const body = ReminderPush.safeParse(await req.json());
  if (!body.success) throw new HttpError(400, body.error.message);
  const db = adminDb();
  const users = await db.collection('users').where('remindersToken', '==', body.data.token).limit(1).get();
  if (users.empty) throw new HttpError(401, 'bad token');
  const uid = users.docs[0]!.id;
  const items = db.collection('users').doc(uid).collection('items');
  const tasks = db.collection('users').doc(uid).collection('tasks');
  const toTriage: any[] = []; let completedFromPhone = 0;
  for (const r of body.data.reminders) {
    const id = createHash('sha256').update(`${uid}|reminder|${r.id}`).digest('hex');
    const existing = await items.doc(id).get();
    if (r.completed) {
      // completed on phone → complete linked task
      const t = await tasks.where('reminderExternalId', '==', r.id).limit(1).get();
      if (!t.empty && t.docs[0]!.data().column !== 'done') { await t.docs[0]!.ref.set({ column: 'done', completedAt: nowIso(), updatedAt: nowIso() }, { merge: true }); completedFromPhone++; }
      if (existing.exists && existing.data()!.status !== 'done') await items.doc(id).set({ status: 'done' }, { merge: true });
      continue;
    }
    if (existing.exists) continue;
    const isSeed = /^(idea|write about|post about|content)[:\s]/i.test(r.title);
    await items.doc(id).set({ userId: uid, source: { type: 'reminder', integrationId: 'reminders', externalId: r.id, list: r.list }, dedupeKey: id, receivedAt: r.modified ?? nowIso(), ingestedAt: nowIso(), raw: { subject: r.title, snippet: r.notes ?? '', body: r.notes ?? '' }, summary: r.title, status: 'new', tags: isSeed ? ['content-seed'] : [], triage: isSeed ? undefined : undefined, dueAt: r.dueDate ?? null });
    toTriage.push({ id, from: `Apple Reminders (${r.list})`, subject: r.title, receivedAt: r.modified ?? nowIso(), snippet: `${r.title}\n${r.notes ?? ''}${r.dueDate ? `\nDue: ${r.dueDate}` : ''}`, hasListUnsubscribe: false, source: 'reminder' });
  }
  if (toTriage.length) await enqueueJob({ userId: uid, type: 'reminders.sync', payload: { items: toTriage } });
  // Outbound: tasks flagged for sync without a reminder yet, and tasks completed in Atlas that have one
  const create = (await tasks.where('syncToReminders', '==', true).get()).docs.filter((d) => !d.data().reminderExternalId && d.data().column !== 'done').map((d) => ({ id: d.id, title: d.data().title, due: d.data().dueAt ?? null, notes: `atlas:${d.id}` }));
  const complete = (await tasks.where('column', '==', 'done').get()).docs.filter((d) => d.data().reminderExternalId && !d.data().reminderCompletedSynced).map((d) => d.data().reminderExternalId as string);
  await audit(uid, `reminders sync: ${toTriage.length} in, ${completedFromPhone} completed on phone, ${create.length} to create, ${complete.length} to complete`);
  return { ok: true, create, complete };
});

/** Shortcut calls back after creating reminders: { token, created:[{taskId, reminderId}], completed:[reminderId] } */
export const PUT = handle(async (req) => {
  const b = await req.json();
  const db = adminDb();
  const users = await db.collection('users').where('remindersToken', '==', b.token).limit(1).get();
  if (users.empty) throw new HttpError(401, 'bad token');
  const uid = users.docs[0]!.id;
  const tasks = db.collection('users').doc(uid).collection('tasks');
  for (const c of b.created ?? []) await tasks.doc(c.taskId).set({ reminderExternalId: c.reminderId }, { merge: true });
  for (const rid of b.completed ?? []) { const t = await tasks.where('reminderExternalId', '==', rid).limit(1).get(); if (!t.empty) await t.docs[0]!.ref.set({ reminderCompletedSynced: true }, { merge: true }); }
  return { ok: true };
});
