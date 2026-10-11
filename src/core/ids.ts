import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** ULID: 48 bits de tempo + 80 bits aleatórios, 26 caracteres, ordenável por criação. */
export function newId(now: number = Date.now()): string {
  let time = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const rnd = randomBytes(16);
  let rand = '';
  for (let i = 0; i < 16; i++) rand += ALPHABET[rnd[i]! % 32];
  return time + rand;
}

export const ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_PATTERN.test(v);
}
