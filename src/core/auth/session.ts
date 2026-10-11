import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import type { Db } from '@/db';
import { memberships, sessions, users } from '@/db/schema';
import { newId } from '@/core/ids';
import { randomToken, sha256Hex } from '@/core/crypto';

export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000; // 8 h de inatividade
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const TOUCH_INTERVAL_MS = 60 * 1000;

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  organizationId: string | null;
}

export async function createSession(
  db: Db,
  input: {
    userId: string;
    organizationId: string | null;
    ip: string;
    userAgent: string | null;
    now?: Date;
  },
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = randomToken();
  const sessionId = newId();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  await db.insert(sessions).values({
    id: sessionId,
    userId: input.userId,
    organizationId: input.organizationId,
    tokenHash: sha256Hex(token),
    ip: input.ip,
    userAgent: input.userAgent?.slice(0, 255) ?? null,
    createdAt: now,
    lastSeenAt: now,
    expiresAt,
  });
  return { token, sessionId, expiresAt };
}

/** Valida o token: não revogada, dentro do prazo absoluto, dentro da janela de inatividade e usuário ativo. */
export async function resolveSession(
  db: Db,
  token: string,
  now = new Date(),
): Promise<ResolvedSession | null> {
  const [row] = await db
    .select({ s: sessions, userStatus: users.status })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256Hex(token)), isNull(sessions.revokedAt)))
    .limit(1);
  if (!row || row.userStatus !== 'active') return null;
  const { s } = row;
  if (s.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - s.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (now.getTime() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, s.id));
  }
  return { sessionId: s.id, userId: s.userId, organizationId: s.organizationId };
}

export async function revokeSession(db: Db, sessionId: string, userId?: string): Promise<boolean> {
  const where = [eq(sessions.id, sessionId), isNull(sessions.revokedAt)];
  if (userId) where.push(eq(sessions.userId, userId));
  const [res] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...where));
  return res.affectedRows > 0;
}

export async function revokeAllSessions(
  db: Db,
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const where = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
  if (exceptSessionId) where.push(ne(sessions.id, exceptSessionId));
  const [res] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(...where));
  return res.affectedRows;
}

export async function listActiveSessions(db: Db, userId: string, now = new Date()) {
  const rows = await db
    .select()
    .from(sessions)
    .where(
      and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
    )
    .orderBy(sessions.createdAt);
  return rows.filter((s) => now.getTime() - s.lastSeenAt.getTime() <= SESSION_IDLE_MS);
}

/** Primeira organização do usuário (mais antiga), para definir a organização ativa no login. */
export async function defaultOrganizationId(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ org: memberships.organizationId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(memberships.createdAt)
    .limit(1);
  return row?.org ?? null;
}
