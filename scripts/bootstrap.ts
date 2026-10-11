import 'dotenv/config';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { getEnv, parseEnv } from '../src/core/env';
import { createPool } from '../src/core/db';
import { createDb } from '../src/db';
import { memberships, organizations, users } from '../src/db/schema';
import { audit } from '../src/core/audit';
import { newId } from '../src/core/ids';
import { seedPermissionsAndRoles, systemRoleId } from '../src/core/permissions/seed';
import { issuePasswordReset } from '../src/modules/auth/service';
import { ensureDefaultRequestTypes } from '../src/modules/requests/service';

/**
 * Cria a primeira organização e seu proprietário (ou um administrador de plataforma).
 * Não há cadastro público: o acesso inicial nasce por este comando, que imprime um link
 * de definição de senha (uso único, 24 h). Nenhuma senha é aceita por argumento.
 *
 *   npm run bootstrap -- --org "Minha Agência" --slug minha-agencia --owner-email a@b.com --owner-name "Fulana"
 *   npm run bootstrap -- --platform-admin-email a@b.com --platform-admin-name "Fulana"
 */
async function main() {
  const { values: v } = parseArgs({
    options: {
      org: { type: 'string' },
      slug: { type: 'string' },
      'owner-email': { type: 'string' },
      'owner-name': { type: 'string' },
      'platform-admin-email': { type: 'string' },
      'platform-admin-name': { type: 'string' },
    },
  });
  parseEnv(process.env);
  const pool = createPool(getEnv().DATABASE_URL);
  const db = createDb(pool);
  try {
    await seedPermissionsAndRoles(db);
    const out: string[] = [];

    if (v['platform-admin-email']) {
      const email = v['platform-admin-email'].toLowerCase();
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const id = existing?.id ?? newId();
      if (!existing)
        await db.insert(users).values({
          id,
          email,
          name: v['platform-admin-name'] ?? email,
          kind: 'internal',
          isPlatformAdmin: 1,
        });
      else await db.update(users).set({ isPlatformAdmin: 1 }).where(eq(users.id, id));
      const r = await issuePasswordReset(db, { userId: id, createdBy: null });
      out.push(
        `Admin da plataforma: ${email}\nLink de senha (24 h, uso único): ${getEnv().APP_URL}/redefinir-senha/${r.token}`,
      );
    }

    if (v.org) {
      if (!v.slug || !v['owner-email']) throw new Error('--org exige --slug e --owner-email');
      const email = v['owner-email'].toLowerCase();
      const orgId = newId();
      await db.insert(organizations).values({ id: orgId, name: v.org, slug: v.slug });
      const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      const userId = existing?.id ?? newId();
      if (!existing)
        await db
          .insert(users)
          .values({ id: userId, email, name: v['owner-name'] ?? email, kind: 'internal' });
      await db.insert(memberships).values({
        id: newId(),
        organizationId: orgId,
        userId,
        roleId: await systemRoleId(db, 'owner'),
        scopeType: 'organization',
        scopeKey: '*',
      });
      await ensureDefaultRequestTypes(db, orgId);
      await audit(db, {
        organizationId: orgId,
        actorUserId: null,
        action: 'organization.bootstrapped',
        entityType: 'organization',
        entityId: orgId,
        metadata: { ownerEmail: email },
      });
      const r = await issuePasswordReset(db, { userId, createdBy: null });
      out.push(
        `Organização "${v.org}" criada. Proprietário: ${email}\nLink de senha (24 h, uso único): ${getEnv().APP_URL}/redefinir-senha/${r.token}`,
      );
    }
    if (out.length === 0)
      throw new Error('Informe --org/--slug/--owner-email e/ou --platform-admin-email.');
    console.log(out.join('\n\n'));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
