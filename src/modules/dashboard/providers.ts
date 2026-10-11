import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { clients, invitations, memberships, roles, users } from '@/db/schema';
import { canOrgWide, type Ctx } from '@/core/auth/context';

export type Severity = 'alert' | 'info';

export interface PendingItem {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  clientId?: string | null;
  clientName?: string | null;
}

export interface DashboardFilters {
  /** Janela, em dias, para dados históricos (atividade). */
  days: number;
  clientId?: string;
  now: Date;
}

/**
 * Provedor de pendências: cada módulo registra o seu aqui quando passa a existir
 * (conteúdos em revisão, tarefas atrasadas, aprovações...). O dashboard não conhece os módulos.
 * Regras: `allowed` decide por permissão; `collect` só devolve dados reais e já filtrados pelo contexto.
 */
export interface PendingProvider {
  id: string;
  allowed(ctx: Ctx): boolean;
  collect(db: Db, ctx: Ctx, filters: DashboardFilters): Promise<PendingItem[]>;
}

const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;
const NEVER_ACCESSED_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const pendingInvitations: PendingProvider = {
  id: 'team.pending-invitations',
  allowed: (ctx) => canOrgWide(ctx, 'team:view'),
  async collect(db, ctx, f) {
    const where = [
      eq(invitations.organizationId, ctx.organizationId),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
    ];
    if (f.clientId) where.push(eq(invitations.clientId, f.clientId));
    const rows = await db
      .select({ inv: invitations, roleName: roles.name, clientName: clients.name })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .leftJoin(clients, eq(clients.id, invitations.clientId))
      .where(and(...where))
      .orderBy(asc(invitations.expiresAt));
    return rows.map(({ inv, roleName, clientName }) => {
      const left = inv.expiresAt.getTime() - f.now.getTime();
      const expired = left <= 0;
      const soon = !expired && left <= EXPIRING_SOON_MS;
      return {
        id: `invitation:${inv.id}`,
        kind: 'invitation',
        severity: expired || soon ? ('alert' as const) : ('info' as const),
        title: expired
          ? `Convite vencido: ${inv.name}`
          : soon
            ? `Convite expira em breve: ${inv.name}`
            : `Convite aguardando aceite: ${inv.name}`,
        detail: `${inv.email} · ${roleName}${expired ? ' · gere um novo convite' : ''}`,
        href: '/equipe',
        clientId: inv.clientId,
        clientName,
      };
    });
  },
};

const externalNeverAccessed: PendingProvider = {
  id: 'team.external-never-accessed',
  allowed: (ctx) => canOrgWide(ctx, 'team:view'),
  async collect(db, ctx, f) {
    const where = [
      eq(memberships.organizationId, ctx.organizationId),
      eq(users.kind, 'external'),
      isNull(users.lastLoginAt),
    ];
    if (f.clientId) where.push(eq(memberships.clientId, f.clientId));
    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        clientId: memberships.clientId,
        clientName: clients.name,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(clients, eq(clients.id, memberships.clientId))
      .where(and(...where));
    return rows
      .filter((r) => f.now.getTime() - r.createdAt.getTime() >= NEVER_ACCESSED_GRACE_MS)
      .map((r) => ({
        id: `external:${r.userId}:${r.clientId ?? ''}`,
        kind: 'external-access',
        severity: 'info' as const,
        title: `Acesso externo ainda não utilizado: ${r.name}`,
        detail: `${r.email}${r.clientName ? ` · ${r.clientName}` : ''}`,
        href: '/equipe',
        clientId: r.clientId,
        clientName: r.clientName,
      }));
  },
};

export const PENDING_PROVIDERS: PendingProvider[] = [pendingInvitations, externalNeverAccessed];
