import path from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { and, eq } from 'drizzle-orm';
import { createPool } from '@/core/db';
import { createDb, type Db } from '@/db';
import { clients, memberships, organizations, users } from '@/db/schema';
import { connect, loadMigrations, migrateUp } from '@/core/migrations';
import { newId } from '@/core/ids';
import { hashPassword } from '@/core/password';
import { createSession } from '@/core/auth/session';
import { buildContext, type Ctx } from '@/core/auth/context';
import { seedPermissionsAndRoles, systemRoleId } from '@/core/permissions/seed';

export const TEST_URL = process.env.TEST_DATABASE_URL;
if (!TEST_URL) throw new Error('TEST_DATABASE_URL é obrigatório para os testes de integração.');
// Trava de segurança: nunca apagar o banco de desenvolvimento/produção.
if (TEST_URL === process.env.DATABASE_URL && process.env.ALLOW_TEST_ON_APP_DB !== '1') {
  if (!/test/i.test(new URL(TEST_URL).pathname))
    throw new Error('TEST_DATABASE_URL deve apontar para um banco de testes.');
}

/** Apaga TODAS as tabelas do banco de testes, reaplica as migrações e o seed. */
export async function resetDatabase(): Promise<void> {
  if (!/test/i.test(new URL(TEST_URL!).pathname))
    throw new Error('Recusado: o nome do banco de testes deve conter "test".');
  const conn = await connect(TEST_URL!);
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
    );
    for (const r of rows) await conn.query(`DROP TABLE IF EXISTS \`${r.t as string}\``);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await migrateUp(conn, await loadMigrations(path.resolve(__dirname, '../../migrations')));
  } finally {
    await conn.end();
  }
  const pool = createPool(TEST_URL!);
  try {
    await seedPermissionsAndRoles(createDb(pool));
  } finally {
    await pool.end();
  }
}

export interface World {
  db: Db;
  pool: Pool;
  close(): Promise<void>;
  org(name: string): Promise<string>;
  client(orgId: string, name: string): Promise<string>;
  user(input: {
    email: string;
    name?: string;
    password?: string;
    kind?: 'internal' | 'external';
  }): Promise<string>;
  member(input: { orgId: string; userId: string; role: string; clientId?: string }): Promise<void>;
  ctx(userId: string, orgId: string): Promise<Ctx>;
  /** Cria usuário + vínculo e devolve contexto pronto. */
  actor(
    orgId: string,
    role: string,
    opts?: { email?: string; clientId?: string },
  ): Promise<{ userId: string; email: string; ctx: Ctx }>;
  sessionToken(userId: string, orgId: string): Promise<string>;
}

let counter = 0;
export function world(): World {
  const pool = createPool(TEST_URL!);
  const db = createDb(pool);
  const w: World = {
    db,
    pool,
    close: () => pool.end(),
    async org(name) {
      const id = newId();
      await db
        .insert(organizations)
        .values({ id, name, slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${++counter}` });
      return id;
    },
    async client(orgId, name) {
      const id = newId();
      await db.insert(clients).values({ id, organizationId: orgId, name });
      return id;
    },
    async user({ email, name, password, kind }) {
      const id = newId();
      await db.insert(users).values({
        id,
        email: email.toLowerCase(),
        name: name ?? email.split('@')[0]!,
        passwordHash: password ? await hashPassword(password) : null,
        kind: kind ?? 'internal',
      });
      return id;
    },
    async member({ orgId, userId, role, clientId }) {
      await db.insert(memberships).values({
        id: newId(),
        organizationId: orgId,
        userId,
        roleId: await systemRoleId(db, role),
        scopeType: clientId ? 'client' : 'organization',
        clientId: clientId ?? null,
        scopeKey: clientId ?? '*',
      });
    },
    async ctx(userId, orgId) {
      const c = await buildContext(db, { userId, organizationId: orgId });
      if (!c) throw new Error('sem contexto');
      return c;
    },
    async actor(orgId, role, opts) {
      const email = opts?.email ?? `u${++counter}-${role}@example.test`;
      const external = role === 'client' || role === 'external_approver';
      const userId = await w.user({ email, kind: external ? 'external' : 'internal' });
      await w.member({ orgId, userId, role, clientId: opts?.clientId });
      return { userId, email, ctx: await w.ctx(userId, orgId) };
    },
    async sessionToken(userId, orgId) {
      return (
        await createSession(db, { userId, organizationId: orgId, ip: 'test', userAgent: 'vitest' })
      ).token;
    },
  };
  return w;
}

export async function memberOf(db: Db, orgId: string, userId: string) {
  return db
    .select()
    .from(memberships)
    .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, userId)));
}
