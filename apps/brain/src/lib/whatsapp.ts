import { config } from '../config';
import { log } from './log';

const api = (path: string) => `https://graph.facebook.com/v21.0/${path}`;

const inQuietHours = (quiet: { start: string; end: string }, tz: string) => {
  const now = new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const [s, e] = [quiet.start, quiet.end];
  return s > e ? now >= s || now < e : now >= s && now < e;
};

export const sendText = async (to: string, body: string, opts?: { quiet?: { start: string; end: string }; tz?: string; force?: boolean }) => {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    log.warn('WhatsApp not configured, would send', { to, body: body.slice(0, 80) });
    return { skipped: 'unconfigured' };
  }
  if (!opts?.force && opts?.quiet && inQuietHours(opts.quiet, opts.tz ?? 'Pacific/Auckland')) return { skipped: 'quietHours' };
  const res = await fetch(api(`${config.whatsapp.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed ${res.status}: ${await res.text()}`);
  return res.json();
};

export const sendTemplate = async (to: string, template: string, params: string[], lang = 'en') => {
  if (!config.whatsapp.accessToken) return { skipped: 'unconfigured' };
  const res = await fetch(api(`${config.whatsapp.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.whatsapp.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to, type: 'template',
      template: { name: template, language: { code: lang }, components: [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: p })) }] },
    }),
  });
  if (!res.ok) throw new Error(`WhatsApp template failed ${res.status}: ${await res.text()}`);
  return res.json();
};

export const downloadMedia = async (mediaId: string): Promise<{ buffer: Buffer; mime: string }> => {
  const meta = await fetch(api(mediaId), { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } }).then((r) => r.json() as Promise<{ url: string; mime_type: string }>);
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${config.whatsapp.accessToken}` } });
  return { buffer: Buffer.from(await bin.arrayBuffer()), mime: meta.mime_type };
};
