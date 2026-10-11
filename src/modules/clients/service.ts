import { and, eq, inArray, isNull, like } from 'drizzle-orm';
import type { Db } from '@/db';
import { clients, memberships, users } from '@/db/schema';
import { audit } from '@/core/audit';
import { can, clientScope, requireAnyScope, requireOrgWide, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import type { ClientUpdate } from './schema';

const notFound = () => new AppError('NOT_FOUND', 'Cliente não encontrado.');
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');

/** Condição base de TODA consulta de clientes: organização do contexto + escopo permitido + não excluído. */
export function visible(ctx: Ctx, perm: string) {
  const scope = clientScope(ctx, perm);
  const base = [eq(clients.organizationId, ctx.organizationId), isNull(clients.deletedAt)];
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(clients.id, '__none__'));
  return and(...base, inArray(clients.id, scope.clientIds));
}

/** Escapa curingas do LIKE para que o texto digitado seja tratado literalmente. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type ClientRow = typeof clients.$inferSelect;

/**
 * Carrega um cliente com checagem de escopo e permissão. Inexistente, de outra organização ou fora do
 * escopo respondem igual (404). Com `perm` diferente de view, falta de permissão no cliente é 403.
 */
export async function loadClient(
  db: Db,
  ctx: Ctx,
  id: string,
  perm = 'clients:view',
): Promise<ClientRow> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(visible(ctx, 'clients:view'), eq(clients.id, id)))
    .limit(1);
  if (!row) throw notFound();
  if (perm !== 'clients:view' && !can(ctx, perm, id)) throw forbidden();
  return row;
}

/** Usuário interno e ativo, membro da organização (responsáveis e donos de perfil). */
export async function assertInternalMember(
  db: Db,
  organizationId: string,
  userId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: users.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(users.id, userId),
        eq(users.kind, 'internal'),
        eq(users.status, 'active'),
      ),
    )
    .limit(1);
  if (!row)
    throw new AppError('VALIDATION', 'Responsável inválido.', {
      ownerUserId: ['Escolha uma pessoa interna da equipe.'],
    });
}

export async function listClients(
  db: Db,
  ctx: Ctx,
  opts: { q?: string; limit?: number; includeInactive?: boolean } = {},
) {
  requireAnyScope(ctx, 'clients:view');
  const where = [visible(ctx, 'clients:view')];
  const q = opts.q?.trim();
  if (q) where.push(like(clients.name, likePattern(q)));
  if (!opts.includeInactive) where.push(eq(clients.status, 'active'));
  const query = db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      createdAt: clients.createdAt,
    })
    .from(clients)
    .where(and(...where))
    .orderBy(clients.name);
  return opts.limit ? query.limit(opts.limit) : query;
}

/** Lista para a tela de clientes: inclui inativos e o nome do responsável. */
export async function listClientsAdmin(db: Db, ctx: Ctx, opts: { q?: string } = {}) {
  requireAnyScope(ctx, 'clients:view');
  const where = [visible(ctx, 'clients:view')];
  const q = opts.q?.trim();
  if (q) where.push(like(clients.name, likePattern(q)));
  return db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      ownerName: users.name,
      slaResponseHours: clients.slaResponseHours,
    })
    .from(clients)
    .leftJoin(users, eq(users.id, clients.ownerUserId))
    .where(and(...where))
    .orderBy(clients.name);
}

/** Detalhe completo. Observações internas só para quem pode editar o cliente (não vão ao portal). */
export async function getClient(db: Db, ctx: Ctx, id: string) {
  const row = await loadClient(db, ctx, id);
  const [owner] = row.ownerUserId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, row.ownerUserId))
    : [];
  const editor = can(ctx, 'clients:edit', id);
  const { internalNotes, ...rest } = row;
  return {
    ...rest,
    ownerName: owner?.name ?? null,
    internalNotes: editor && ctx.userKind === 'internal' ? internalNotes : null,
    deletedAt: undefined,
  };
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

const FIELDS = [
  'name',
  'status',
  'ownerUserId',
  'objectives',
  'audience',
  'toneOfVoice',
  'editorialGuidelines',
  'languageRestrictions',
  'allowedTopics',
  'forbiddenTopics',
  'visualIdentity',
  'recurringInfo',
  'internalNotes',
  'approvalFlow',
  'slaResponseHours',
  'slaDeliveryDays',
] as const;

const short = (v: unknown) =>
  typeof v === 'string' && v.length > 120 ? `${v.slice(0, 120)}… (${v.length} car.)` : (v ?? null);

/** Atualização parcial. O histórico registra campo, valor anterior e novo (textos longos truncados). */
export async function updateClient(db: Db, ctx: Ctx, id: string, patch: ClientUpdate) {
  const existing = await loadClient(db, ctx, id, 'clients:edit');
  if (ctx.userKind !== 'internal' && 'internalNotes' in patch) throw forbidden();
  if (patch.name !== undefined) await assertNameFree(db, ctx, patch.name, id);
  if (patch.ownerUserId) await assertInternalMember(db, ctx.organizationId, patch.ownerUserId);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const set: Record<string, unknown> = {};
  for (const f of FIELDS) {
    if (!(f in patch)) continue;
    const next = (patch as Record<string, unknown>)[f] ?? null;
    const prev = (existing as Record<string, unknown>)[f] ?? null;
    if (next !== prev) {
      set[f] = next;
      changes[f] = { from: short(prev), to: short(next) };
    }
  }
  if (Object.keys(set).length === 0) return getClient(db, ctx, id);
  await db.transaction(async (tx) => {
    await tx
      .update(clients)
      .set(set)
      .where(and(eq(clients.id, id), eq(clients.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'client.updated',
      entityType: 'client',
      entityId: id,
      metadata: { changes },
      ip: ctx.ip,
    });
  });
  return getClient(db, ctx, id);
}

/** Exclusão lógica (lixeira). Recuperação: Etapa 11. */
export async function deleteClient(db: Db, ctx: Ctx, id: string) {
  await loadClient(db, ctx, id, 'clients:delete');
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

/** Mantida para compatibilidade com a Etapa 02 (renomear). */
export async function renameClient(db: Db, ctx: Ctx, id: string, input: { name: string }) {
  const r = await updateClient(db, ctx, id, { name: input.name });
  return { id, name: r.name };
}

/** Pessoas internas ativas da organização (responsável pelo cliente, dono de perfil). */
export async function listOwnerCandidates(db: Db, ctx: Ctx) {
  requireAnyScope(ctx, 'clients:edit');
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, ctx.organizationId),
        eq(users.kind, 'internal'),
        eq(users.status, 'active'),
      ),
    )
    .orderBy(users.name);
}
