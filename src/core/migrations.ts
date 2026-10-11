import { promises as fs } from 'node:fs';
import path from 'node:path';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

/**
 * Migrações versionadas em SQL puro: `NNNN_nome.up.sql` e `NNNN_nome.down.sql`.
 * Atenção: DDL do MySQL causa commit implícito, então não há atomicidade por migração.
 * Por isso cada arquivo deve ser pequeno e idempotente quando possível.
 */
const FILE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

export interface MigrationFile {
  version: string;
  name: string;
  up: string;
  down: string;
}

export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const files = (await fs.readdir(dir)).sort();
  const map = new Map<string, Partial<MigrationFile>>();
  for (const f of files) {
    const m = FILE.exec(f);
    if (!m) continue;
    const [, version, name, kind] = m as unknown as [string, string, string, 'up' | 'down'];
    const entry = map.get(version) ?? { version, name };
    entry[kind] = await fs.readFile(path.join(dir, f), 'utf8');
    map.set(version, entry);
  }
  const out: MigrationFile[] = [];
  for (const [version, e] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!e.up || !e.down)
      throw new Error(`Migração ${version} precisa de arquivos .up.sql e .down.sql`);
    out.push(e as MigrationFile);
  }
  return out;
}

export async function connect(url: string): Promise<Connection> {
  return mysql.createConnection({ uri: url, multipleStatements: true, timezone: 'Z' });
}

const ENSURE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version CHAR(4) NOT NULL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export async function applied(conn: Connection): Promise<string[]> {
  await conn.query(ENSURE);
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return rows.map((r) => r.version as string);
}

export async function migrateUp(conn: Connection, migrations: MigrationFile[]): Promise<string[]> {
  const done = new Set(await applied(conn));
  const ran: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await conn.query(m.up);
    await conn.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [
      m.version,
      m.name,
    ]);
    ran.push(m.version);
  }
  return ran;
}

/** Reverte a última migração aplicada (ou as `steps` últimas). */
export async function migrateDown(
  conn: Connection,
  migrations: MigrationFile[],
  steps = 1,
): Promise<string[]> {
  const done = await applied(conn);
  const reverted: string[] = [];
  for (const version of done.reverse().slice(0, steps)) {
    const m = migrations.find((x) => x.version === version);
    if (!m) throw new Error(`Migração ${version} aplicada, mas arquivo não encontrado`);
    await conn.query(m.down);
    await conn.query('DELETE FROM schema_migrations WHERE version = ?', [version]);
    reverted.push(version);
  }
  return reverted;
}
