import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import type { Db } from '@/db';
import { notificationPreferences, notifications } from '@/db/schema';
import type { Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { createLogger } from '@/core/logger';
import { NOTIFICATION_TYPE_KEYS, isNotificationType, type NotificationType } from './types';

export const NOTIFICATIONS_PAGE_SIZE = 20;

export interface NewNotification {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Caminho interno (começa com "/"). */
  link?: string;
}

/**
 * Emite uma notificação respeitando a preferência do destinatário. É "melhor esforço":
 * uma falha aqui nunca deve desfazer ou quebrar a ação que a originou.
 */
export async function notify(db: Db, n: NewNotification): Promise<boolean> {
  try {
    const [pref] = await db
      .select({ enabled: notificationPreferences.enabled })
      .from(notificationPreferences)
      .where(
        and(eq(notificationPreferences.userId, n.userId), eq(notificationPreferences.type, n.type)),
      )
      .limit(1);
    if (pref && pref.enabled === 0) return false;
    if (n.link && !/^\/(?![/\\])/.test(n.link))
      throw new Error('link de notificação deve ser interno');
    await db.insert(notifications).values({
      id: newId(),
      organizationId: n.organizationId,
      userId: n.userId,
      type: n.type,
      title: n.title.slice(0, 190),
      body: (n.body ?? '').slice(0, 500),
      link: n.link ?? null,
    });
    return true;
  } catch (err) {
    createLogger().warn('Falha ao emitir notificação', { type: n.type, err });
    return false;
  }
}

/** Todas as consultas filtram por destinatário E organização ativa: ninguém lê notificação alheia. */
const mine = (ctx: Ctx) =>
  and(eq(notifications.userId, ctx.userId), eq(notifications.organizationId, ctx.organizationId));

export async function unreadCount(db: Db, ctx: Ctx): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(mine(ctx), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export async function listNotifications(
  db: Db,
  ctx: Ctx,
  opts: { unreadOnly?: boolean; before?: string } = {},
) {
  const where = [mine(ctx)];
  if (opts.unreadOnly) where.push(isNull(notifications.readAt));
  if (opts.before) where.push(lt(notifications.id, opts.before));
  const rows = await db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(notifications.id))
    .limit(NOTIFICATIONS_PAGE_SIZE + 1);
  const hasMore = rows.length > NOTIFICATIONS_PAGE_SIZE;
  const items = (hasMore ? rows.slice(0, NOTIFICATIONS_PAGE_SIZE) : rows).map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.readAt !== null,
    createdAt: r.createdAt,
  }));
  return {
    items,
    nextBefore: hasMore ? items[items.length - 1]!.id : null,
    unread: await unreadCount(db, ctx),
  };
}

export async function markRead(db: Db, ctx: Ctx, id: string): Promise<void> {
  const [row] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(mine(ctx), eq(notifications.id, id)))
    .limit(1);
  if (!row) throw new AppError('NOT_FOUND', 'Notificação não encontrada.');
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(mine(ctx), eq(notifications.id, id), isNull(notifications.readAt)));
}

export async function markAllRead(db: Db, ctx: Ctx): Promise<number> {
  const [res] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(mine(ctx), isNull(notifications.readAt)));
  return res.affectedRows;
}

export async function getPreferences(db: Db, ctx: Ctx) {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, ctx.userId),
        inArray(notificationPreferences.type, NOTIFICATION_TYPE_KEYS),
      ),
    );
  const off = new Set(rows.filter((r) => r.enabled === 0).map((r) => r.type));
  return NOTIFICATION_TYPE_KEYS.map((type) => ({ type, enabled: !off.has(type) }));
}

export async function setPreference(
  db: Db,
  ctx: Ctx,
  type: string,
  enabled: boolean,
): Promise<void> {
  if (!isNotificationType(type)) throw new AppError('VALIDATION', 'Tipo de notificação inválido.');
  await db
    .insert(notificationPreferences)
    .values({ userId: ctx.userId, type, enabled: enabled ? 1 : 0 })
    .onDuplicateKeyUpdate({ set: { enabled: enabled ? 1 : 0 } });
}
