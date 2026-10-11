import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv } from '@/core/env';

const valid = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'mysql://u:SENHA_SECRETA@localhost:3306/db',
  STORAGE_DIR: './storage',
};

describe('parseEnv', () => {
  it('aceita configuração válida e aplica padrões', () => {
    const env = parseEnv(valid);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.STORAGE_DIR).toBe('./storage');
  });

  it('falha com mensagem clara quando falta variável obrigatória', () => {
    const { DATABASE_URL: _omit, ...incomplete } = valid;
    void _omit;
    expect(() => parseEnv(incomplete)).toThrowError(EnvError);
    expect(() => parseEnv(incomplete)).toThrowError(/DATABASE_URL/);
  });

  it('rejeita DATABASE_URL que não é mysql e não vaza o valor na mensagem', () => {
    try {
      parseEnv({ ...valid, DATABASE_URL: 'postgres://u:SENHA_SECRETA@h/db' });
      throw new Error('deveria falhar');
    } catch (e) {
      expect(e).toBeInstanceOf(EnvError);
      expect((e as Error).message).toContain('DATABASE_URL');
      expect((e as Error).message).not.toContain('SENHA_SECRETA');
    }
  });
});
