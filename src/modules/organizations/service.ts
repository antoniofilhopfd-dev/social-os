import { eq } from 'drizzle-orm';
import type { Db } from '@/db';
import { memberships, organizations, sessions } from '@/db/schema';
import { audit } from '@/core/audit';
import { buildContext, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';

export async function listMyOrganizations(db: Db, userId: string) {
  return db
    .selectDistinct({ id: organizations.id, name: organizations.name })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.name);
}

/** Troca a organização ativa da sessão. Só é possível para organizações das quais o usuário é membro. */
export async function switchOrganization(db: Db, ctx: Ctx, organizationId: string): Promise<void> {
  if (!ctx.sessionId) throw new AppError('UNAUTHENTICATED', 'Sessão inválida.');
  // O vínculo é revalidado no servidor: organização alheia é indistinguível de inexistente.
  const next = await buildContext(db, {
    userId: ctx.userId,
    organizationId,
    sessionId: ctx.sessionId,
    ip: ctx.ip,
  });
  if (!next) throw new AppError('NOT_FOUND', 'Organização não encontrada.');
  await db.update(sessions).set({ organizationId }).where(eq(sessions.id, ctx.sessionId));
  await audit(db, {
    organizationId,
    actorUserId: ctx.userId,
    action: 'session.organization_switched',
    entityType: 'session',
    entityId: ctx.sessionId,
    metadata: { from: ctx.organizationId },
    ip: ctx.ip,
  });
}
