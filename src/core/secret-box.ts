import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** Cifra segredos curtos em repouso (AES-256-GCM) com chave derivada de APP_SECRET. Formato: v1.iv.tag.dados (base64url). */
function key(secret: string, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'socialos', purpose, 32));
}

export function seal(plain: string, secret: string, purpose = 'secret-box'): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret, purpose), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    c.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function open(sealed: string, secret: string, purpose = 'secret-box'): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Formato de segredo cifrado inválido.');
  const d = createDecipheriv('aes-256-gcm', key(secret, purpose), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
