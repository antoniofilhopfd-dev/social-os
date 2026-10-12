import { and, isNotNull, lt, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { authAttempts, passwordResets, sessions } from '@/db/schema';

const DAY = 86_400_000;

export interface CleanupResult {
  sessions: number;
  passwordResets: number;
  authAttempts: number;
}

const affected = (r: unknown): number => (r as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;

/**
 * Limpeza de dados efêmeros: sessões expiradas/revogadas há mais de 30 dias, links de senha vencidos ou usados
 * há mais de 30 dias e tentativas de login com mais de 7 dias. Nunca toca em dados de negócio nem na auditoria.
 */
export async function cleanupExpired(db: Db, now = new Date()): Promise<CleanupResult> {
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const s = await db
    .delete(sessions)
    .where(
      or(
        lt(sessions.expiresAt, d30),
        and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, d30)),
      ),
    );
  const p = await db
    .delete(passwordResets)
    .where(
      or(
        lt(passwordResets.expiresAt, d30),
        and(isNotNull(passwordResets.usedAt), lt(passwordResets.usedAt, d30)),
      ),
    );
  const a = await db.delete(authAttempts).where(lt(authAttempts.createdAt, d7));
  return { sessions: affected(s), passwordResets: affected(p), authAttempts: affected(a) };
}
