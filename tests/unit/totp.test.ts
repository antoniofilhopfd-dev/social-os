import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hotp, verifyTotp, otpauthUri } from '@/core/totp';
import { open, seal } from '@/core/secret-box';

// Segredo "12345678901234567890" em base32 (vetores do RFC 4226/6238)
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TOTP/HOTP', () => {
  it('vetores do RFC 4226', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((code, i) => expect(hotp(SECRET, i)).toBe(code));
  });
  it('vetor do RFC 6238 (SHA-1, T=59s → 94287082 → 287082)', () => {
    expect(verifyTotp(SECRET, '287082', new Date(59_000))).toBe(1);
  });
  it('aceita ±1 janela, recusa fora dela e recusa reutilização', () => {
    const now = new Date(1_000_000_000_000);
    const step = Math.floor(now.getTime() / 30000);
    expect(verifyTotp(SECRET, hotp(SECRET, step), now)).toBe(step);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(SECRET, hotp(SECRET, step + 1), now)).toBe(step + 1);
    expect(verifyTotp(SECRET, hotp(SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(SECRET, hotp(SECRET, step), now, step)).toBeNull(); // replay
    expect(verifyTotp(SECRET, hotp(SECRET, step - 1), now, step)).toBeNull();
    expect(verifyTotp(SECRET, '12345', now)).toBeNull();
    expect(verifyTotp(SECRET, 'abcdef', now)).toBeNull();
  });
  it('base32 ida e volta; uri do autenticador', () => {
    const buf = Buffer.from([1, 2, 3, 250, 251, 252, 0, 9]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(base32Decode('gezd gnbv-gy3t qojq')).toEqual(Buffer.from('1234567890'));
    expect(otpauthUri('Social Media OS', 'a@b.com', 'ABC')).toContain(
      'otpauth://totp/Social%20Media%20OS%3Aa%40b.com?secret=ABC',
    );
  });
});

describe('cofre de segredos', () => {
  const key = 'x'.repeat(40);
  it('cifra e decifra; chave/propósito errados falham; adulteração é detectada', () => {
    const s = seal('JBSWY3DPEHPK3PXP', key, 'totp');
    expect(s).not.toContain('JBSWY3DP');
    expect(open(s, key, 'totp')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => open(s, 'y'.repeat(40), 'totp')).toThrow();
    expect(() => open(s, key, 'outro')).toThrow();
    const parts = s.split('.');
    parts[3] = Buffer.from('adulterado').toString('base64url');
    expect(() => open(parts.join('.'), key, 'totp')).toThrow();
    expect(seal('a', key)).not.toBe(seal('a', key)); // IV aleatório
  });
});
