import { and, eq, isNull, like, ne, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { clients, invitations, memberships, roles, sessions, users } from '@/db/schema';
import { audit } from '@/core/audit';
import { assertCanGrant, requireOrgWide, type Ctx } from '@/core/auth/context';
import { randomToken, sha256Hex } from '@/core/crypto';
import { isDuplicateEntry } from '@/core/db';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { permissionsOfRoles } from '@/core/permissions/seed';
import { notify } from '@/modules/notifications/service';
import { likePattern } from '@/modules/clients/service';
import { INVITE_TTL_MS, issuePasswordReset, normalizeEmail } from '@/modules/auth/service';

/** Função utilizável nesta organização: do sistema (sem dono) ou personalizada da própria organização. */
async function usableRole(db: Db, ctx: Ctx, roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role || (role.organizationId !== null && role.organizationId !== ctx.organizationId)) {
    throw new AppError('NOT_FOUND', 'Função não encontrada.');
  }
  return role;
}

async function assertClientInOrg(db: Db, ctx: Ctx, clientId: string) {
  const [c] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        eq(clients.id, clientId),
        eq(clients.organizationId, ctx.organizationId),
        isNull(clients.deletedAt),
      ),
    )
    .limit(1);
  if (!c) throw new AppError('NOT_FOUND', 'Cliente não encontrado.');
}

export async function listTeam(db: Db, ctx: Ctx, opts: { q?: string } = {}) {
  requireOrgWide(ctx, 'team:view');
  const q = opts.q?.trim();
  const rows = await db
    .select({
      membershipId: memberships.id,
      scopeType: memberships.scopeType,
      clientId: memberships.clientId,
      clientName: clients.name,
      roleId: roles.id,
      roleName: roles.name,
      userId: users.id,
      name: users.name,
      email: users.email,
      kind: users.kind,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .leftJoin(clients, eq(clients.id, memberships.clientId))
    .where(
      and(
        eq(memberships.organizationId, ctx.organizationId),
        q ? or(like(users.name, likePattern(q)), like(users.email, likePattern(q))) : undefined,
      ),
    )
    .orderBy(users.name);
  const pending = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      name: invitations.name,
      roleName: roles.name,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
    })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(
      and(
        eq(invitations.organizationId, ctx.organizationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    )
    .orderBy(invitations.createdAt);
  return { members: rows, invitations: pending };
}

export async function createInvitation(
  db: Db,
  ctx: Ctx,
  input: { email: string; name: string; roleId: string; clientId?: string | null },
  now = new Date(),
) {
  requireOrgWide(ctx, 'team:create');
  const email = normalizeEmail(input.email);
  const role = await usableRole(db, ctx, input.roleId);
  const perms = (await permissionsOfRoles(db, [role.id])).get(role.id) ?? new Set<string>();
  assertCanGrant(ctx, perms);
  if (role.kind === 'external' && !input.clientId) {
    throw new AppError('VALIDATION', 'Funções externas precisam estar vinculadas a um cliente.', {
      clientId: ['Informe o cliente.'],
    });
  }
  if (input.clientId) await assertClientInOrg(db, ctx, input.clientId);

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing && existing.kind !== role.kind) {
    throw new AppError(
      'CONFLICT',
      'Este e-mail pertence a uma conta de outro tipo (interna/externa).',
    );
  }
  if (existing) {
    const [dup] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, ctx.organizationId),
          eq(memberships.userId, existing.id),
          eq(memberships.roleId, role.id),
          eq(memberships.scopeKey, input.clientId ?? '*'),
        ),
      )
      .limit(1);
    if (dup) throw new AppError('CONFLICT', 'Esta pessoa já possui essa função nesse escopo.');
  }

  const token = randomToken();
  const id = newId();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  await db.transaction(async (tx) => {
    // Um convite pendente por e-mail e organização: o novo substitui o anterior.
    await tx
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.organizationId, ctx.organizationId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      );
    await tx.insert(invitations).values({
      id,
      organizationId: ctx.organizationId,
      email,
      name: input.name.trim(),
      roleId: role.id,
      scopeType: input.clientId ? 'client' : 'organization',
      clientId: input.clientId ?? null,
      tokenHash: sha256Hex(token),
      expiresAt,
      createdBy: ctx.userId,
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'invitation.created',
      entityType: 'invitation',
      entityId: id,
      metadata: { roleId: role.id, clientId: input.clientId ?? null },
      ip: ctx.ip,
    });
  });
  return { id, token, expiresAt };
}

export async function revokeInvitation(db: Db, ctx: Ctx, invitationId: string) {
  requireOrgWide(ctx, 'team:delete');
  const [res] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.organizationId, ctx.organizationId),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
      ),
    );
  if (res.affectedRows === 0) throw new AppError('NOT_FOUND', 'Convite não encontrado.');
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'invitation.revoked',
    entityType: 'invitation',
    entityId: invitationId,
    ip: ctx.ip,
  });
}

async function loadMembership(db: Db, ctx: Ctx, membershipId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(
      and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.organizationId)),
    )
    .limit(1);
  if (!m) throw new AppError('NOT_FOUND', 'Vínculo não encontrado.');
  return m;
}

/** Impede remover/rebaixar o último vínculo com a permissão `roles:edit` em toda a organização. */
async function assertNotLastOwner(
  db: Db,
  ctx: Ctx,
  membership: { id: string; roleId: string; scopeType: string },
) {
  if (membership.scopeType !== 'organization') return;
  const [role] = await db
    .select({ key: roles.keyName })
    .from(roles)
    .where(eq(roles.id, membership.roleId))
    .limit(1);
  if (role?.key !== 'owner') return;
  const owners = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(
        eq(memberships.organizationId, ctx.organizationId),
        eq(roles.keyName, 'owner'),
        ne(memberships.id, membership.id),
      ),
    );
  if (owners.length === 0)
    throw new AppError('CONFLICT', 'A organização precisa manter pelo menos um proprietário.');
}

async function assertCanTouchMember(db: Db, ctx: Ctx, roleId: string) {
  const perms = (await permissionsOfRoles(db, [roleId])).get(roleId) ?? new Set<string>();
  assertCanGrant(ctx, perms); // não mexe em quem tem mais poder do que você
}

export async function changeMemberRole(db: Db, ctx: Ctx, membershipId: string, newRoleId: string) {
  requireOrgWide(ctx, 'team:edit');
  const m = await loadMembership(db, ctx, membershipId);
  const role = await usableRole(db, ctx, newRoleId);
  const [target] = await db
    .select({ kind: users.kind })
    .from(users)
    .where(eq(users.id, m.userId))
    .limit(1);
  if (target?.kind !== role.kind)
    throw new AppError('CONFLICT', 'O tipo da conta não é compatível com esta função.');
  await assertCanTouchMember(db, ctx, m.roleId);
  const perms = (await permissionsOfRoles(db, [role.id])).get(role.id) ?? new Set<string>();
  assertCanGrant(ctx, perms);
  await assertNotLastOwner(db, ctx, m);
  try {
    await db.update(memberships).set({ roleId: role.id }).where(eq(memberships.id, m.id));
  } catch (e) {
    if (isDuplicateEntry(e))
      throw new AppError('CONFLICT', 'Esta pessoa já possui essa função nesse escopo.');
    throw e;
  }
  await notify(db, {
    organizationId: ctx.organizationId,
    userId: m.userId,
    type: 'role_changed',
    title: 'Sua função foi alterada',
    body: `Nova função: ${role.name}.`,
    link: '/',
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'membership.role_changed',
    entityType: 'membership',
    entityId: m.id,
    metadata: { userId: m.userId, from: m.roleId, to: role.id },
    ip: ctx.ip,
  });
}

export async function removeMember(db: Db, ctx: Ctx, membershipId: string) {
  requireOrgWide(ctx, 'team:delete');
  const m = await loadMembership(db, ctx, membershipId);
  await assertCanTouchMember(db, ctx, m.roleId);
  await assertNotLastOwner(db, ctx, m);
  await db.transaction(async (tx) => {
    await tx.delete(memberships).where(eq(memberships.id, m.id));
    const remaining = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(eq(memberships.userId, m.userId), eq(memberships.organizationId, ctx.organizationId)),
      )
      .limit(1);
    if (remaining.length === 0) {
      // Sem vínculos nesta organização: derruba as sessões que a tinham ativa.
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(sessions.userId, m.userId),
            eq(sessions.organizationId, ctx.organizationId),
            isNull(sessions.revokedAt),
          ),
        );
    }
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'membership.removed',
      entityType: 'membership',
      entityId: m.id,
      metadata: { userId: m.userId, roleId: m.roleId },
      ip: ctx.ip,
    });
  });
}

/** Gera link de redefinição de senha para um membro da organização. */
export async function createResetLinkForMember(db: Db, ctx: Ctx, userId: string) {
  requireOrgWide(ctx, 'team:manage_users');
  const rows = await db
    .select({ roleId: memberships.roleId })
    .from(memberships)
    .where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, userId)));
  if (rows.length === 0) throw new AppError('NOT_FOUND', 'Usuário não encontrado.');
  const [target] = await db
    .select({ isAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (target?.isAdmin === 1)
    throw new AppError('FORBIDDEN', 'Esta conta não pode ser redefinida por aqui.');
  const perms = await permissionsOfRoles(
    db,
    rows.map((r) => r.roleId),
  );
  for (const set of perms.values()) assertCanGrant(ctx, set); // evita tomar a conta de alguém mais poderoso
  const reset = await issuePasswordReset(db, { userId, createdBy: ctx.userId });
  await notify(db, {
    organizationId: ctx.organizationId,
    userId,
    type: 'password_reset_issued',
    title: 'Um administrador gerou um link de nova senha para a sua conta',
    body: 'Se você não pediu isso, avise a administração e revise suas sessões.',
    link: '/minhas-sessoes',
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'user.password_reset_issued',
    entityType: 'user',
    entityId: userId,
    ip: ctx.ip,
  });
  return reset;
}
