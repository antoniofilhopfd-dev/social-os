import { createHash, randomBytes } from 'node:crypto';

/** Token opaco com 256 bits de entropia, seguro para URL e cookie. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash de tokens (alta entropia) para armazenamento. O token em claro nunca é gravado. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
