import 'server-only';
import { createCipheriv, randomBytes, createHash } from 'node:crypto';
export type Sealed = { v: 1; iv: string; tag: string; data: string };
export const seal = (plain: string): Sealed => {
  const k = process.env.ATLAS_MASTER_KEY; if (!k || k.length < 64) throw new Error('ATLAS_MASTER_KEY missing');
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', Buffer.from(k, 'hex'), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
};
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
