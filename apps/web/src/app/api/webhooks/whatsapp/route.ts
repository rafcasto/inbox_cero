import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/server/admin';
import { enqueueJob } from '@/lib/server/upstash';

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === process.env.WHATSAPP_VERIFY_TOKEN) return new Response(u.searchParams.get('hub.challenge') ?? '', { status: 200 });
  return new Response('forbidden', { status: 403 });
}

const verify = (raw: string, sig: string | null) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured yet
  if (!sig?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(sig.slice(7)); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verify(raw, req.headers.get('x-hub-signature-256'))) return new Response('bad signature', { status: 401 });
  const body = JSON.parse(raw);
  const db = adminDb();
  for (const entry of body.entry ?? []) for (const change of entry.changes ?? []) {
    for (const m of change.value?.messages ?? []) {
      const from = String(m.from);
      const users = await db.collection('users').where('whatsappNumber', '==', from).limit(1).get();
      if (users.empty) { console.warn('whatsapp from unknown number', from.slice(-4)); continue; }
      const uid = users.docs[0]!.id;
      const type = ['text', 'image', 'audio', 'document', 'interactive', 'button'].includes(m.type) ? m.type : 'unknown';
      const media = m.image ?? m.audio ?? m.document;
      await enqueueJob({ userId: uid, type: 'whatsapp.inbound', idempotencyKey: `wa:${m.id}`, payload: { from, messageId: m.id, timestamp: String(m.timestamp), type, text: m.text?.body ?? m.interactive?.button_reply?.title ?? m.button?.text, mediaId: media?.id, mediaMime: media?.mime_type, caption: media?.caption } });
    }
  }
  return NextResponse.json({ ok: true });
}
