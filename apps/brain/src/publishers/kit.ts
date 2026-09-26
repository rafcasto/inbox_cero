import { register } from './index';
import { col } from '../lib/firestore';
import { open as unseal } from '../lib/crypto';

/** Kit (ConvertKit) v4: creates a DRAFT broadcast — never sends. */
register({
  channel: 'kit',
  async publish(ctx, c) {
    const s = await col(ctx.uid, 'integrations').where('type', '==', 'kit').limit(1).get();
    if (s.empty) throw new Error('Kit is not connected (Settings → Integrations → Kit API key)');
    const apiKey = unseal(s.docs[0]!.data().secret);
    const html = c.body.split(/\n{2,}/).map((p) => p.startsWith('# ') ? `<h1>${p.slice(2)}</h1>` : p.startsWith('## ') ? `<h2>${p.slice(3)}</h2>` : `<p>${p.replace(/\n/g, '<br/>')}</p>`).join('\n');
    const r = await fetch('https://api.kit.com/v4/broadcasts', { method: 'POST', headers: { 'X-Kit-Api-Key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: c.title || 'Untitled', content: html, public: false, send_at: null, email_template_id: null }) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Kit → ${r.status}: ${j.errors?.join?.(', ') ?? j.error ?? 'error'}`);
    const id = String(j.broadcast?.id ?? j.id ?? '');
    return { channel: 'kit', id, url: id ? `https://app.kit.com/campaigns/${id}` : undefined, status: 'draft' };
  },
});
