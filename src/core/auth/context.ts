import { and, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { memberships, roles, users } from '@/db/schema';
import { permissionsOfRoles } from '@/core/permissions/seed';
import { AppError } from '@/core/errors';

/** Conjunto de permissões válido para um escopo: `clientId = null` significa a organização inteira. */
export interface Grant {
  permissions: Set<string>;
  clientId: string | null;
}

/**
 * Contexto de autorização. É o ÚNICO caminho para acessar dados de domínio:
 * todo serviço recebe um Ctx e filtra por `organizationId` e pelos escopos de cliente.
 */
export interface Ctx {
  userId: string;
  userKind: 'internal' | 'external';
  isPlatformAdmin: boolean;
  organizationId: string;
  sessionId: string | null;
  ip: string;
  grants: Grant[];
}

export async function buildContext(
  db: Db,
  input: { userId: string; organizationId: string; sessionId?: string | null; ip?: string },
): Promise<Ctx | null> {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || user.status !== 'active') return null;
  const rows = await db
    .select({ roleId: memberships.roleId, clientId: memberships.clientId })
    .from(memberships)
    .innerJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(
        eq(memberships.userId, input.userId),
        eq(memberships.organizationId, input.organizationId),
        // Funções personalizadas só valem na organização dona; funções do sistema valem em qualquer uma.
        or(isNull(roles.organizationId), eq(roles.organizationId, input.organizationId)),
      ),
    );
  if (rows.length === 0) return null;
  const perms = await permissionsOfRoles(db, [...new Set(rows.map((r) => r.roleId))]);
  return {
    userId: user.id,
    userKind: user.kind,
    isPlatformAdmin: user.isPlatformAdmin === 1,
    organizationId: input.organizationId,
    sessionId: input.sessionId ?? null,
    ip: input.ip ?? 'unknown',
    grants: rows.map((r) => ({
      permissions: perms.get(r.roleId) ?? new Set<string>(),
      clientId: r.clientId,
    })),
  };
}

/** Pode `perm` na organização inteira (ou, se `clientId` for informado, naquele cliente)? */
export function can(ctx: Ctx, perm: string, clientId?: string): boolean {
  return ctx.grants.some(
    (g) =>
      g.permissions.has(perm) &&
      (g.clientId === null || (clientId !== undefined && g.clientId === clientId)),
  );
}

export function canOrgWide(ctx: Ctx, perm: string): boolean {
  return ctx.grants.some((g) => g.clientId === null && g.permissions.has(perm));
}

export function forbidden(): AppError {
  return new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
}

export function requireOrgWide(ctx: Ctx, perm: string): void {
  if (!canOrgWide(ctx, perm)) throw forbidden();
}

/** Exige a permissão em pelo menos um escopo (organização inteira ou algum cliente). */
export function requireAnyScope(ctx: Ctx, perm: string): void {
  if (!ctx.grants.some((g) => g.permissions.has(perm))) throw forbidden();
}

export function requireCan(ctx: Ctx, perm: string, clientId?: string): void {
  if (!can(ctx, perm, clientId)) throw forbidden();
}

export interface ClientScope {
  /** true = todos os clientes da organização */
  all: boolean;
  clientIds: string[];
}

/** Quais clientes o usuário enxerga para uma permissão. Vazio e `all=false` = nenhum. */
export function clientScope(ctx: Ctx, perm: string): ClientScope {
  const granting = ctx.grants.filter((g) => g.permissions.has(perm));
  if (granting.some((g) => g.clientId === null)) return { all: true, clientIds: [] };
  return { all: false, clientIds: [...new Set(granting.map((g) => g.clientId!))] };
}

/** União das permissões concedidas na organização inteira. Base da regra anti-escalada de privilégio. */
export function orgWidePermissions(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const g of ctx.grants) if (g.clientId === null) g.permissions.forEach((p) => out.add(p));
  return out;
}

/** Só é possível conceder/alterar algo cujas permissões você mesmo possui na organização inteira. */
export function assertCanGrant(ctx: Ctx, permissionCodes: Iterable<string>): void {
  const mine = orgWidePermissions(ctx);
  for (const p of permissionCodes) {
    if (!mine.has(p)) {
      throw new AppError('FORBIDDEN', 'Você não pode conceder permissões que não possui.');
    }
  }
}
