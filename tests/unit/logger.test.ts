import { describe, expect, it } from 'vitest';
import { createLogger, REDACTED, redact } from '@/core/logger';

describe('logger', () => {
  it('emite JSON estruturado', () => {
    const lines: string[] = [];
    createLogger({ sink: (l) => lines.push(l) }).info('olá', { requestId: 'r1' });
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ level: 'info', msg: 'olá', requestId: 'r1' });
    expect(typeof entry.time).toBe('string');
  });

  it('redige chaves sensíveis e credenciais em URLs, inclusive aninhadas', () => {
    const lines: string[] = [];
    createLogger({ sink: (l) => lines.push(l) }).error('falha', {
      password: 'abc123',
      user: { token: 'tok_999', name: 'Ana' },
      headers: { authorization: 'Bearer xyz', cookie: 'sid=1' },
      url: 'mysql://root:SENHA_SECRETA@localhost/db',
    });
    const out = lines[0]!;
    for (const secret of ['abc123', 'tok_999', 'Bearer xyz', 'sid=1', 'SENHA_SECRETA']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('Ana');
    expect(out).toContain(REDACTED);
  });

  it('redige credenciais em mensagens de Error', () => {
    const r = redact(new Error('falha em mysql://u:SENHA_SECRETA@h/db')) as { message: string };
    expect(r.message).not.toContain('SENHA_SECRETA');
  });

  it('respeita o nível mínimo', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'warn', sink: (l) => lines.push(l) });
    log.info('ignorado');
    log.warn('registrado');
    expect(lines).toHaveLength(1);
  });
});
