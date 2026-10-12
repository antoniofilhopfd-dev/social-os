import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import mysql from 'mysql2/promise';
import { clients, sessions } from '@/db/schema';
import { countRows, createBackup, pruneBackups, restoreBackup } from '@/core/backup';
import { cleanupExpired } from '@/core/maintenance';
import { newId } from '@/core/ids';
import { createClient } from '@/modules/clients/service';
import { createContent } from '@/modules/contents/service';
import { resetDatabase, world, TEST_URL, type World } from '../helpers/db';

const RESTORE_URL = process.env.RESTORE_TEST_DATABASE_URL;
const PASS = 'frase-de-backup-bem-longa-123';
let w: World;
let tmp: string;
let storage: string;

async function wipe(url: string) {
  const conn = await mysql.createConnection({ uri: url, multipleStatements: true });
  const [rows] = await conn.query('SHOW FULL TABLES WHERE Table_type = "BASE TABLE"');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const r of rows as Record<string, string>[])
    await conn.query(`DROP TABLE IF EXISTS \`${Object.values(r)[0]}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();
}

beforeAll(async () => {
  await resetDatabase();
  w = world();
  tmp = await mkdtemp(path.join(os.tmpdir(), 'socialos-bktest-'));
  storage = path.join(tmp, 'storage');
  await mkdir(path.join(storage, 'a', 'b'), { recursive: true });
  await writeFile(
    path.join(storage, 'a', 'b', 'arquivo.bin'),
    Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]),
  );
  await writeFile(path.join(storage, 'a', 'texto acentuado ção.txt'), 'olá, mundo');
  const org = await w.org('Agência Backup');
  const owner = await w.actor(org, 'owner');
  const c = await createClient(w.db, owner.ctx, {
    name: 'Cliente Ação & "Aspas" ; ponto-e-vírgula',
  });
  await createContent(w.db, owner.ctx, {
    clientId: c.id,
    title: 'Título com emoji 🎬 e acentos',
    format: 'text',
  } as never);
});
afterAll(async () => {
  await w.close();
  await rm(tmp, { recursive: true, force: true });
});

describe.skipIf(!RESTORE_URL)('backup e restauração (banco de verdade)', () => {
  it('backup cifrado → restauração em banco limpo preserva contagens, texto e arquivos', async () => {
    await wipe(RESTORE_URL!);
    const { file, manifest } = await createBackup({
      databaseUrl: TEST_URL!,
      storageDir: storage,
      outDir: path.join(tmp, 'out'),
      passphrase: PASS,
    });
    expect(file.endsWith('.tar.gz.enc')).toBe(true);
    expect(manifest.encrypted).toBe(true);
    expect(manifest.tables.clients).toBe(1);
    // cifrado de fato: nenhum texto do banco aparece no arquivo
    expect((await readFile(file)).includes(Buffer.from('Cliente Ação'))).toBe(false);

    const restoredStorage = path.join(tmp, 'storage-restaurado');
    const r = await restoreBackup({
      file,
      targetDatabaseUrl: RESTORE_URL!,
      storageDir: restoredStorage,
      passphrase: PASS,
    });
    expect(r.tables).toBeGreaterThan(30);

    const original = await countRows(TEST_URL!);
    const restored = await countRows(RESTORE_URL!);
    expect(restored.tables).toEqual(original.tables);
    expect(restored.migrations).toEqual(original.migrations);
    // conteúdo textual (acentos, aspas, emoji) idêntico
    const conn = await mysql.createConnection({ uri: RESTORE_URL! });
    const [rows] = await conn.query('SELECT name FROM clients');
    const [rows2] = await conn.query('SELECT title FROM contents');
    await conn.end();
    expect((rows as { name: string }[])[0]!.name).toBe('Cliente Ação & "Aspas" ; ponto-e-vírgula');
    expect((rows2 as { title: string }[])[0]!.title).toBe('Título com emoji 🎬 e acentos');
    // arquivos idênticos, byte a byte
    expect(await readFile(path.join(restoredStorage, 'a', 'b', 'arquivo.bin'))).toEqual(
      Buffer.from([0, 1, 2, 3, 250, 251, 252, 253]),
    );
    expect(await readFile(path.join(restoredStorage, 'a', 'texto acentuado ção.txt'), 'utf8')).toBe(
      'olá, mundo',
    );
  });

  it('recusa destino não vazio sem --force, frase errada e arquivo adulterado', async () => {
    const { file } = await createBackup({
      databaseUrl: TEST_URL!,
      storageDir: storage,
      outDir: path.join(tmp, 'out2'),
      passphrase: PASS,
    });
    // o banco de destino ainda tem o restore do teste anterior
    await expect(
      restoreBackup({ file, targetDatabaseUrl: RESTORE_URL!, passphrase: PASS }),
    ).rejects.toThrow(/não está vazio/);
    await wipe(RESTORE_URL!);
    await expect(
      restoreBackup({ file, targetDatabaseUrl: RESTORE_URL!, passphrase: 'frase-errada-123456' }),
    ).rejects.toThrow(/incorreta|adulterado/);
    await expect(restoreBackup({ file, targetDatabaseUrl: RESTORE_URL! })).rejects.toThrow(
      /cifrado/,
    );
    // nada foi escrito no destino pelas tentativas recusadas
    expect(Object.keys((await countRows(RESTORE_URL!)).tables)).toHaveLength(0);
    const bytes = await readFile(file);
    bytes[bytes.length - 40] = bytes[bytes.length - 40]! ^ 0xff;
    const tampered = path.join(tmp, 'adulterado.tar.gz.enc');
    await writeFile(tampered, bytes);
    await expect(
      restoreBackup({ file: tampered, targetDatabaseUrl: RESTORE_URL!, passphrase: PASS }),
    ).rejects.toThrow(/incorreta|adulterado/);
  });

  it('backup sem cifra funciona; --force sobrescreve; a senha do banco nunca aparece nos arquivos', async () => {
    const { file, manifest } = await createBackup({
      databaseUrl: TEST_URL!,
      storageDir: storage,
      outDir: path.join(tmp, 'out3'),
    });
    expect(file.endsWith('.tar.gz')).toBe(true);
    expect(manifest.encrypted).toBe(false);
    await wipe(RESTORE_URL!);
    await restoreBackup({ file, targetDatabaseUrl: RESTORE_URL! });
    await restoreBackup({ file, targetDatabaseUrl: RESTORE_URL!, force: true });
    expect((await countRows(RESTORE_URL!)).tables.clients).toBe(1);
    expect((await readFile(file)).includes(Buffer.from('socialos_dev_pw'))).toBe(false);
  });

  it('retenção apaga só backups antigos com o nome do programa', async () => {
    const dir = path.join(tmp, 'ret');
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 30; i++) {
      const d = new Date(Date.UTC(2031, 0, 31) - i * 86_400_000);
      const n = `socialos-${d.toISOString().slice(0, 10).replace(/-/g, '')}T033000Z.tar.gz`;
      await writeFile(path.join(dir, n), 'x');
    }
    await writeFile(path.join(dir, 'anotacao-do-usuario.txt'), 'não apagar');
    const removed = await pruneBackups(dir);
    expect(removed.length).toBeGreaterThan(10);
    const left = await readdir(dir);
    expect(left).toContain('anotacao-do-usuario.txt');
    expect(left).toContain('socialos-20310131T033000Z.tar.gz');
  });
});

describe('limpeza de dados efêmeros', () => {
  it('remove sessões vencidas há mais de 30 dias e preserva as recentes e os dados de negócio', async () => {
    const org = await w.org('Agência Limpeza');
    const a = await w.actor(org, 'owner');
    const now = new Date('2031-06-01T12:00:00Z');
    const mkSession = (expiresAt: Date, revokedAt: Date | null = null) =>
      w.db.insert(sessions).values({
        id: newId(),
        userId: a.userId,
        organizationId: org,
        tokenHash: newId() + newId().slice(0, 10),
        expiresAt,
        revokedAt,
      } as never);
    await mkSession(new Date('2031-04-01T00:00:00Z')); // vencida há 60 dias
    await mkSession(new Date('2031-06-10T00:00:00Z')); // ainda válida
    await mkSession(new Date('2031-06-10T00:00:00Z'), new Date('2031-04-10T00:00:00Z')); // revogada há 50 dias
    const before = await w.db.select().from(clients);
    const r = await cleanupExpired(w.db, now);
    expect(r.sessions).toBe(2);
    expect((await w.db.select().from(sessions).where(eq(sessions.userId, a.userId))).length).toBe(
      1,
    );
    expect(await w.db.select().from(clients)).toEqual(before);
  });
});
