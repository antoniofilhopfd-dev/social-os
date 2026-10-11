import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '@/db';
import { auditLogs, users } from '@/db/schema';
import { requireOrgWide, type Ctx } from '@/core/auth/context';

export const AUDIT_PAGE_SIZE = 50;

export async function listAudit(db: Db, ctx: Ctx, opts: { before?: string; action?: string } = {}) {
  requireOrgWide(ctx, 'audit:view');
  const where = [eq(auditLogs.organizationId, ctx.organizationId)];
  if (opts.before) where.push(lt(auditLogs.id, opts.before));
  if (opts.action) where.push(eq(auditLogs.action, opts.action));
  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      ip: auditLogs.ip,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(...where))
    .orderBy(desc(auditLogs.id))
    .limit(AUDIT_PAGE_SIZE + 1);
  const hasMore = rows.length > AUDIT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, AUDIT_PAGE_SIZE) : rows;
  return { items, nextBefore: hasMore ? items[items.length - 1]!.id : null };
}
