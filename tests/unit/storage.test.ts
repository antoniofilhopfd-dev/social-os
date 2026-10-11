import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from '@/integrations/storage/local';

let dir: string;
let driver: LocalStorageDriver;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'socialos-storage-'));
  driver = new LocalStorageDriver(dir);
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('LocalStorageDriver', () => {
  it('grava, lê, verifica e remove', async () => {
    const r = await driver.put('org1/cliente1/arq.txt', Buffer.from('conteúdo'));
    expect(r.size).toBe(Buffer.byteLength('conteúdo'));
    expect(await driver.exists('org1/cliente1/arq.txt')).toBe(true);
    expect((await driver.get('org1/cliente1/arq.txt')).toString()).toBe('conteúdo');
    await driver.delete('org1/cliente1/arq.txt');
    expect(await driver.exists('org1/cliente1/arq.txt')).toBe(false);
  });

  it('não sobrescreve objeto existente', async () => {
    await driver.put('a.txt', Buffer.from('1'));
    await expect(driver.put('a.txt', Buffer.from('2'))).rejects.toThrow();
  });

  it.each(['../fora.txt', 'a/../../fora.txt', '/etc/passwd', 'a//b', '.oculto', 'a/./b', ''])(
    'rejeita chave insegura %j',
    async (key) => {
      await expect(driver.put(key, Buffer.from('x'))).rejects.toThrow(
        'Chave de armazenamento inválida',
      );
    },
  );
});
