import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { clients } from '@/db/schema';
import { audit } from '@/core/audit';
import { clientScope, requireAnyScope, requireOrgWide, can, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';

const notFound = () => new AppError('NOT_FOUND', 'Cliente não encontrado.');

/** Condição base de TODA consulta de clientes: organização do contexto + escopo permitido + não excluído. */
function visible(ctx: Ctx, perm: string) {
  const scope = clientScope(ctx, perm);
  const base = [eq(clients.organizationId, ctx.organizationId), isNull(clients.deletedAt)];
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(clients.id, '__none__'));
  return and(...base, inArray(clients.id, scope.clientIds));
}

export async function listClients(db: Db, ctx: Ctx) {
  requireAnyScope(ctx, 'clients:view'); // o escopo fino vem da condição `visible`
  return db
    .select({ id: clients.id, name: clients.name, createdAt: clients.createdAt })
    .from(clients)
    .where(visible(ctx, 'clients:view'))
    .orderBy(clients.name);
}

export async function getClient(db: Db, ctx: Ctx, id: string) {
  // Cliente inexistente, de outra organização ou fora do escopo respondem igual: não vaza existência.
  const [row] = await db
    .select({ id: clients.id, name: clients.name, createdAt: clients.createdAt })
    .from(clients)
    .where(and(visible(ctx, 'clients:view'), eq(clients.id, id)))
    .limit(1);
  if (!row) throw notFound();
  return row;
}

async function assertNameFree(db: Db, ctx: Ctx, name: string, exceptId?: string) {
  const rows = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, ctx.organizationId),
        isNull(clients.deletedAt),
        eq(clients.name, name),
      ),
    );
  if (rows.some((r) => r.id !== exceptId))
    throw new AppError('CONFLICT', 'Já existe um cliente com este nome.');
}

export async function createClient(db: Db, ctx: Ctx, input: { name: string }) {
  requireOrgWide(ctx, 'clients:create');
  const name = input.name.trim();
  await assertNameFree(db, ctx, name);
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(clients).values({ id, organizationId: ctx.organizationId, name });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'client.created',
      entityType: 'client',
      entityId: id,
      metadata: { name },
      ip: ctx.ip,
    });
  });
  return { id, name };
}

export async function renameClient(db: Db, ctx: Ctx, id: string, input: { name: string }) {
  const existing = await getClient(db, ctx, id); // 404 se fora do escopo
  if (!can(ctx, 'clients:edit', existing.id))
    throw new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
  const name = input.name.trim();
  await assertNameFree(db, ctx, name, id);
  await db.transaction(async (tx) => {
    await tx
      .update(clients)
      .set({ name })
      .where(and(eq(clients.id, id), eq(clients.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'client.updated',
      entityType: 'client',
      entityId: id,
      metadata: { from: existing.name, to: name },
      ip: ctx.ip,
    });
  });
  return { id, name };
}

/** Exclusão lógica (lixeira). A purga definitiva e a recuperação ficam para a etapa de estabilização. */
export async function deleteClient(db: Db, ctx: Ctx, id: string) {
  const existing = await getClient(db, ctx, id);
  if (!can(ctx, 'clients:delete', existing.id))
    throw new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
  await db.transaction(async (tx) => {
    await tx
      .update(clients)
      .set({ deletedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'client.deleted',
      entityType: 'client',
      entityId: id,
      ip: ctx.ip,
    });
  });
}
