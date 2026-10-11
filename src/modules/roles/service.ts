import { and, count, desc, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { invitations, memberships, rolePermissions, roles } from '@/db/schema';
import { audit } from '@/core/audit';
import {
  assertCanGrant,
  canOrgWide,
  forbidden,
  orgWidePermissions,
  requireOrgWide,
  type Ctx,
} from '@/core/auth/context';
import { isDuplicateEntry } from '@/core/db';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { PERMISSION_SET } from '@/core/permissions/catalog';
import { permissionsOfRoles } from '@/core/permissions/seed';

export interface RoleInput {
  name: string;
  description?: string;
  kind: 'internal' | 'external';
  permissions: string[];
}

function validatePermissions(codes: string[]): string[] {
  const unique = [...new Set(codes)];
  const bad = unique.filter((c) => !PERMISSION_SET.has(c));
  if (bad.length) throw new AppError('VALIDATION', 'Permissão inválida.', { permissions: bad });
  return unique;
}

export async function listRoles(db: Db, ctx: Ctx) {
  requireOrgWide(ctx, 'roles:view');
  const rows = await db
    .select()
    .from(roles)
    .where(or(isNull(roles.organizationId), eq(roles.organizationId, ctx.organizationId)))
    .orderBy(desc(roles.isSystem), roles.name);
  const perms = await permissionsOfRoles(
    db,
    rows.map((r) => r.id),
  );
  const usage = await db
    .select({ roleId: memberships.roleId, n: count() })
    .from(memberships)
    .where(eq(memberships.organizationId, ctx.organizationId))
    .groupBy(memberships.roleId);
  const used = new Map(usage.map((u) => [u.roleId, Number(u.n)]));
  return rows.map((r) => ({
    id: r.id,
    key: r.keyName,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem === 1,
    kind: r.kind,
    permissions: [...(perms.get(r.id) ?? [])].sort(),
    members: used.get(r.id) ?? 0,
  }));
}

export async function createRole(db: Db, ctx: Ctx, input: RoleInput) {
  requireOrgWide(ctx, 'roles:create');
  const codes = validatePermissions(input.permissions);
  assertCanGrant(ctx, codes);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(roles).values({
        id,
        organizationId: ctx.organizationId,
        name: input.name.trim(),
        description: input.description?.trim() ?? '',
        isSystem: 0,
        kind: input.kind,
      });
      if (codes.length)
        await tx
          .insert(rolePermissions)
          .values(codes.map((c) => ({ roleId: id, permissionCode: c })));
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'role.created',
        entityType: 'role',
        entityId: id,
        metadata: { permissions: codes },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    if (isDuplicateEntry(e)) throw new AppError('CONFLICT', 'Já existe uma função com este nome.');
    throw e;
  }
  return { id };
}

async function loadOwnRole(db: Db, ctx: Ctx, roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  // Funções do sistema e de outras organizações aparecem como inexistentes para edição/exclusão.
  if (!role || role.organizationId !== ctx.organizationId)
    throw new AppError('NOT_FOUND', 'Função não encontrada.');
  return role;
}

export async function updateRole(db: Db, ctx: Ctx, roleId: string, input: RoleInput) {
  requireOrgWide(ctx, 'roles:edit');
  const role = await loadOwnRole(db, ctx, roleId);
  const codes = validatePermissions(input.permissions);
  assertCanGrant(ctx, codes);
  const current = (await permissionsOfRoles(db, [role.id])).get(role.id) ?? new Set<string>();
  assertCanGrant(ctx, current); // não altera função mais poderosa que você
  if (role.kind !== input.kind) {
    const [inUse] = await db
      .select({ n: count() })
      .from(memberships)
      .where(eq(memberships.roleId, role.id));
    if (Number(inUse?.n ?? 0) > 0)
      throw new AppError('CONFLICT', 'Não é possível mudar o tipo de uma função em uso.');
  }
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(roles)
        .set({
          name: input.name.trim(),
          description: input.description?.trim() ?? '',
          kind: input.kind,
        })
        .where(eq(roles.id, role.id));
      await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
      if (codes.length)
        await tx
          .insert(rolePermissions)
          .values(codes.map((c) => ({ roleId: role.id, permissionCode: c })));
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'role.updated',
        entityType: 'role',
        entityId: role.id,
        metadata: { permissions: codes },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    if (isDuplicateEntry(e)) throw new AppError('CONFLICT', 'Já existe uma função com este nome.');
    throw e;
  }
}

export async function deleteRole(db: Db, ctx: Ctx, roleId: string) {
  requireOrgWide(ctx, 'roles:delete');
  const role = await loadOwnRole(db, ctx, roleId);
  const [m] = await db
    .select({ n: count() })
    .from(memberships)
    .where(eq(memberships.roleId, role.id));
  const [i] = await db
    .select({ n: count() })
    .from(invitations)
    .where(
      and(
        eq(invitations.roleId, role.id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    );
  if (Number(m?.n ?? 0) + Number(i?.n ?? 0) > 0) {
    throw new AppError(
      'CONFLICT',
      'A função está em uso. Reatribua as pessoas antes de excluí-la.',
    );
  }
  await db.transaction(async (tx) => {
    await tx.delete(roles).where(eq(roles.id, role.id));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'role.deleted',
      entityType: 'role',
      entityId: role.id,
      ip: ctx.ip,
    });
  });
}

/** Funções que o usuário pode atribuir (apenas as cujas permissões ele mesmo possui). Usado em Equipe. */
export async function listAssignableRoles(db: Db, ctx: Ctx) {
  if (!canOrgWide(ctx, 'team:create') && !canOrgWide(ctx, 'team:edit')) throw forbidden();
  const rows = await db
    .select()
    .from(roles)
    .where(or(isNull(roles.organizationId), eq(roles.organizationId, ctx.organizationId)))
    .orderBy(desc(roles.isSystem), roles.name);
  const perms = await permissionsOfRoles(
    db,
    rows.map((r) => r.id),
  );
  const mine = orgWidePermissions(ctx);
  return rows
    .filter((r) => [...(perms.get(r.id) ?? [])].every((p) => mine.has(p)))
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind }));
}
