import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { config } from '../config';

/** AES-256-GCM. Key = ATLAS_MASTER_KEY (hex, 32 bytes). Same helper is mirrored in apps/web/src/lib/crypto.ts. */
const key = () => {
  if (!config.masterKey || config.masterKey.length < 64) throw new Error('ATLAS_MASTER_KEY missing or too short (need 32 bytes hex)');
  return Buffer.from(config.masterKey, 'hex');
};

export type Sealed = { v: 1; iv: string; tag: string; data: string };

export const seal = (plain: string): Sealed => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') };
};

export const open = (s: Sealed): string => {
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(s.iv, 'base64'));
  d.setAuthTag(Buffer.from(s.tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(s.data, 'base64')), d.final()]).toString('utf8');
};

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
