import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { applied, connect, loadMigrations, migrateDown, migrateUp } from '@/core/migrations';

// Integração real com MySQL. Usa exclusivamente TEST_DATABASE_URL.
const url = process.env.TEST_DATABASE_URL;
const run = url ? describe : describe.skip;

run('migrações (MySQL real)', () => {
  let conn: Connection;
  const dir = path.resolve(__dirname, '../../migrations');

  beforeAll(async () => {
    conn = await connect(url!);
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const [all] = await conn.query<RowDataPacket[]>(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    for (const r of all) await conn.query(`DROP TABLE IF EXISTS \`${r.t as string}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  });
  afterAll(async () => {
    await conn.end();
  });

  const tables = async () => {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    return rows.map((r) => r.t as string);
  };

  it('aplica em banco limpo', async () => {
    const m = await loadMigrations(dir);
    expect(m.length).toBeGreaterThan(0);
    const ran = await migrateUp(conn, m);
    expect(ran).toEqual(['0001', '0002', '0003', '0004']);
    expect(await tables()).toEqual(
      expect.arrayContaining(['organizations', 'users', 'sessions', 'audit_logs', 'memberships']),
    );
    expect(await tables()).toContain('system_info');
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT value FROM system_info WHERE `key`='schema_baseline'",
    );
    expect(rows[0]?.value).toBe('0001');
  });

  it('é idempotente ao reaplicar', async () => {
    expect(await migrateUp(conn, await loadMigrations(dir))).toEqual([]);
  });

  it('reverte e reaplica', async () => {
    const m = await loadMigrations(dir);
    expect(await migrateDown(conn, m, m.length)).toContain('0001');
    expect(await tables()).not.toContain('system_info');
    expect(await applied(conn)).toEqual([]);
    expect(await migrateUp(conn, m)).toContain('0001');
    expect(await tables()).toContain('system_info');
  });
});
