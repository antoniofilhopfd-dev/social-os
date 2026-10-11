import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { authAttempts } from '@/db/schema';
import { sha256Hex } from '@/core/crypto';
import { AppError } from '@/core/errors';

export const WINDOW_MS = 15 * 60 * 1000;
export const LIMITS = {
  loginPerEmail: 5,
  loginPerIp: 30,
  tokenPerIp: 20,
} as const;

type Kind = 'login' | 'token';

export function subjectHash(value: string): string {
  return sha256Hex(value.trim().toLowerCase());
}

async function failures(
  db: Db,
  kind: Kind,
  by: { subject?: string; ip?: string },
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const where = [
    eq(authAttempts.kind, kind),
    eq(authAttempts.succeeded, 0),
    gte(authAttempts.createdAt, since),
  ];
  if (by.subject) where.push(eq(authAttempts.subjectHash, by.subject));
  if (by.ip) where.push(eq(authAttempts.ip, by.ip));
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(authAttempts)
    .where(and(...where));
  return Number(rows[0]?.n ?? 0);
}

export function tooMany(): AppError {
  return new AppError(
    'RATE_LIMITED',
    'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
  );
}

export async function assertLoginAllowed(
  db: Db,
  email: string,
  ip: string,
  now = new Date(),
): Promise<void> {
  const [byEmail, byIp] = await Promise.all([
    failures(db, 'login', { subject: subjectHash(email) }, now),
    failures(db, 'login', { ip }, now),
  ]);
  if (byEmail >= LIMITS.loginPerEmail || byIp >= LIMITS.loginPerIp) throw tooMany();
}

export async function assertTokenAllowed(db: Db, ip: string, now = new Date()): Promise<void> {
  if ((await failures(db, 'token', { ip }, now)) >= LIMITS.tokenPerIp) throw tooMany();
}

export async function recordAttempt(
  db: Db,
  kind: Kind,
  subject: string,
  ip: string,
  succeeded: boolean,
): Promise<void> {
  await db
    .insert(authAttempts)
    .values({ kind, subjectHash: subjectHash(subject), ip, succeeded: succeeded ? 1 : 0 });
}
