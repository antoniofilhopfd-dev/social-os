import { and, count, eq, gte, isNull, desc } from 'drizzle-orm';
import type { Db } from '@/db';
import { auditLogs, invitations, memberships, users } from '@/db/schema';
import { canOrgWide, type Ctx } from '@/core/auth/context';
import { listClients } from '@/modules/clients/service';
import { PENDING_PROVIDERS, type DashboardFilters, type PendingItem } from './providers';

export const PERIOD_OPTIONS = [7, 30, 90] as const;

export interface DashboardData {
  filters: { days: number; clientId: string | null };
  clientsInScope: { id: string; name: string }[];
  counters: { clients: number; members: number | null; pendingInvitations: number | null };
  pending: PendingItem[];
  activity: { id: string; action: string; actorName: string | null; createdAt: Date }[] | null;
}

export function normalizeDays(value: unknown): number {
  const n = Number(value);
  return (PERIOD_OPTIONS as readonly number[]).includes(n) ? n : 30;
}

export async function getDashboard(
  db: Db,
  ctx: Ctx,
  input: { days?: number; clientId?: string | null },
  now = new Date(),
): Promise<DashboardData> {
  const days = normalizeDays(input.days);
  const clientsInScope = ctx.grants.some((g) => g.permissions.has('clients:view'))
    ? (await listClients(db, ctx)).map((c) => ({ id: c.id, name: c.name }))
    : [];
  // O filtro de cliente só vale para clientes dentro do escopo do usuário.
  const clientId =
    input.clientId && clientsInScope.some((c) => c.id === input.clientId) ? input.clientId : null;
  const filters: DashboardFilters = { days, clientId: clientId ?? undefined, now };

  const collected = await Promise.all(
    PENDING_PROVIDERS.filter((p) => p.allowed(ctx)).map((p) => p.collect(db, ctx, filters)),
  );
  const pending = collected
    .flat()
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'alert' ? -1 : 1));

  const teamAllowed = canOrgWide(ctx, 'team:view');
  const members = teamAllowed
    ? Number(
        (
          await db
            .select({ n: count() })
            .from(memberships)
            .where(eq(memberships.organizationId, ctx.organizationId))
        )[0]?.n ?? 0,
      )
    : null;
  const pendingInvitations = teamAllowed
    ? Number(
        (
          await db
            .select({ n: count() })
            .from(invitations)
            .where(
              and(
                eq(invitations.organizationId, ctx.organizationId),
                isNull(invitations.acceptedAt),
                isNull(invitations.revokedAt),
              ),
            )
        )[0]?.n ?? 0,
      )
    : null;

  let activity: DashboardData['activity'] = null;
  if (canOrgWide(ctx, 'audit:view')) {
    const since = new Date(now.getTime() - days * 86_400_000);
    const where = [
      eq(auditLogs.organizationId, ctx.organizationId),
      gte(auditLogs.createdAt, since),
    ];
    if (clientId) where.push(eq(auditLogs.entityType, 'client'), eq(auditLogs.entityId, clientId));
    activity = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: users.name,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .where(and(...where))
      .orderBy(desc(auditLogs.id))
      .limit(10);
  }

  return {
    filters: { days, clientId },
    clientsInScope,
    counters: { clients: clientsInScope.length, members, pendingInvitations },
    pending,
    activity,
  };
}
