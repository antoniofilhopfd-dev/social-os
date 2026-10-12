import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@/db';
import { recoveryCodes, users } from '@/db/schema';
import { audit } from '@/core/audit';
import type { Ctx } from '@/core/auth/context';
import { sha256Hex } from '@/core/crypto';
import { getEnv } from '@/core/env';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { verifyPassword } from '@/core/password';
import { assertLoginAllowed, recordAttempt } from '@/core/rate-limit';
import { open, seal } from '@/core/secret-box';
import { generateSecret, otpauthUri, verifyTotp } from '@/core/totp';
import { randomBytes } from 'node:crypto';

const PURPOSE = 'totp';
const ISSUER = 'Social Media OS';
export const RECOVERY_CODE_COUNT = 10;

const appSecret = (): string => {
  const s = getEnv().APP_SECRET;
  if (!s)
    throw new AppError(
      'CONFLICT',
      'A autenticação em dois fatores não está disponível: o administrador precisa definir APP_SECRET no servidor.',
    );
  return s;
};

/** Código de recuperação legível (ex.: 4f9k2-m8q1x), 50 bits de entropia, uso único. */
export function newRecoveryCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}
const normalizeRecovery = (c: string) => c.trim().toLowerCase().replace(/[\s-]/g, '');
const hashRecovery = (c: string) => sha256Hex(`recovery:${normalizeRecovery(c)}`);

async function loadUser(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new AppError('NOT_FOUND', 'Usuário não encontrado.');
  return u;
}

export async function twoFactorStatus(db: Db, ctx: Ctx) {
  const u = await loadUser(db, ctx.userId);
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(recoveryCodes)
    .where(and(eq(recoveryCodes.userId, ctx.userId), isNull(recoveryCodes.usedAt)));
  return {
    enabled: u.totpEnabledAt !== null,
    available: !!getEnv().APP_SECRET,
    recoveryCodesRemaining: Number(r?.n ?? 0),
  };
}

/** Gera um segredo novo (ainda não ativo) e o devolve uma única vez para o app autenticador. */
export async function beginSetup(db: Db, ctx: Ctx) {
  const key = appSecret();
  const u = await loadUser(db, ctx.userId);
  if (u.totpEnabledAt)
    throw new AppError('CONFLICT', 'A autenticação em dois fatores já está ativa.');
  const secret = generateSecret();
  await db
    .update(users)
    .set({ totpSecretEnc: seal(secret, key, PURPOSE), totpLastStep: null })
    .where(eq(users.id, u.id));
  return { secret, uri: otpauthUri(ISSUER, u.email, secret) };
}

async function issueRecoveryCodes(
  db: Pick<Db, 'insert' | 'delete'>,
  userId: string,
): Promise<string[]> {
  await db.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await db
    .insert(recoveryCodes)
    .values(codes.map((c) => ({ id: newId(), userId, codeHash: hashRecovery(c) })));
  return codes;
}

/** Confirma a configuração com um código do app; só então o 2FA passa a valer. Devolve os códigos de recuperação (uma vez). */
export async function enableTwoFactor(db: Db, ctx: Ctx, code: string, now = new Date()) {
  const key = appSecret();
  const u = await loadUser(db, ctx.userId);
  if (u.totpEnabledAt)
    throw new AppError('CONFLICT', 'A autenticação em dois fatores já está ativa.');
  if (!u.totpSecretEnc) throw new AppError('CONFLICT', 'Inicie a configuração antes de confirmar.');
  const step = verifyTotp(open(u.totpSecretEnc, key, PURPOSE), code, now, null);
  if (step == null)
    throw new AppError(
      'VALIDATION',
      'Código inválido. Confira o horário do celular e tente de novo.',
      {
        code: ['Código inválido.'],
      },
    );
  const codes = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ totpEnabledAt: now, totpLastStep: step })
      .where(eq(users.id, u.id));
    return issueRecoveryCodes(tx, u.id);
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'auth.2fa_enabled',
    entityType: 'user',
    entityId: u.id,
    ip: ctx.ip,
  });
  return { recoveryCodes: codes };
}

/**
 * Verifica o segundo fator no login: código TOTP (uso único por janela) ou código de recuperação (uso único).
 * Devolve 'totp' | 'recovery' | null.
 */
export async function verifySecondFactor(
  db: Db,
  user: typeof users.$inferSelect,
  code: string,
  now = new Date(),
): Promise<'totp' | 'recovery' | null> {
  if (!user.totpEnabledAt || !user.totpSecretEnc) return null;
  const given = code.trim();
  if (/^\d{3}\s?\d{3}$/.test(given)) {
    const key = appSecret();
    const step = verifyTotp(open(user.totpSecretEnc, key, PURPOSE), given, now, user.totpLastStep);
    if (step == null) return null;
    // atômico: dois logins simultâneos com o mesmo código não passam ambos
    const res = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(
        and(
          eq(users.id, user.id),
          sql`(${users.totpLastStep} IS NULL OR ${users.totpLastStep} < ${step})`,
        ),
      );
    const affected = (res as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
    return affected === 1 ? 'totp' : null;
  }
  if (normalizeRecovery(given).length === 10) {
    const res = await db
      .update(recoveryCodes)
      .set({ usedAt: now })
      .where(
        and(
          eq(recoveryCodes.userId, user.id),
          eq(recoveryCodes.codeHash, hashRecovery(given)),
          isNull(recoveryCodes.usedAt),
        ),
      );
    const affected = (res as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 0;
    return affected === 1 ? 'recovery' : null;
  }
  return null;
}

async function reauthenticate(db: Db, ctx: Ctx, password: string, code: string, now: Date) {
  const u = await loadUser(db, ctx.userId);
  const ip = ctx.ip ?? 'desconhecido';
  // as mesmas travas de tentativas do login valem para confirmar senha/código em ações sensíveis
  await assertLoginAllowed(db, u.email, ip, now);
  const fail = async (field: 'password' | 'code', msg: string) => {
    await recordAttempt(db, 'login', u.email, ip, false);
    return new AppError('VALIDATION', msg, { [field]: [msg] });
  };
  if (!u.passwordHash || !(await verifyPassword(u.passwordHash, password)))
    throw await fail('password', 'Senha incorreta.');
  if (!u.totpEnabledAt)
    throw new AppError('CONFLICT', 'A autenticação em dois fatores não está ativa.');
  if (!(await verifySecondFactor(db, u, code, now))) throw await fail('code', 'Código inválido.');
  return u;
}

export async function disableTwoFactor(
  db: Db,
  ctx: Ctx,
  input: { password: string; code: string },
  now = new Date(),
) {
  const u = await reauthenticate(db, ctx, input.password, input.code, now);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null })
      .where(eq(users.id, u.id));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, u.id));
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'auth.2fa_disabled',
    entityType: 'user',
    entityId: u.id,
    ip: ctx.ip,
  });
}

export async function regenerateRecoveryCodes(
  db: Db,
  ctx: Ctx,
  input: { password: string; code: string },
  now = new Date(),
) {
  const u = await reauthenticate(db, ctx, input.password, input.code, now);
  const codes = await db.transaction((tx) => issueRecoveryCodes(tx, u.id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'auth.2fa_recovery_regenerated',
    entityType: 'user',
    entityId: u.id,
    ip: ctx.ip,
  });
  return { recoveryCodes: codes };
}
