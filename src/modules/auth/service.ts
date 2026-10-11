import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { invitations, memberships, passwordResets, roles, users } from '@/db/schema';
import { audit } from '@/core/audit';
import type { Ctx } from '@/core/auth/context';
import {
  createSession,
  defaultOrganizationId,
  listActiveSessions,
  revokeAllSessions,
  revokeSession,
} from '@/core/auth/session';
import { randomToken, sha256Hex } from '@/core/crypto';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { burnVerification, hashPassword, validatePassword, verifyPassword } from '@/core/password';
import { assertLoginAllowed, assertTokenAllowed, recordAttempt } from '@/core/rate-limit';
import { notify } from '@/modules/notifications/service';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 24 * 60 * 60 * 1000;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

const BAD_LOGIN = () => new AppError('UNAUTHENTICATED', 'E-mail ou senha incorretos.');
const BAD_TOKEN = () => new AppError('NOT_FOUND', 'Link inválido, expirado ou já utilizado.');

export interface Origin {
  ip: string;
  userAgent: string | null;
}

export async function login(
  db: Db,
  input: { email: string; password: string } & Origin,
  now = new Date(),
) {
  const email = normalizeEmail(input.email);
  await assertLoginAllowed(db, email, input.ip, now);

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok =
    !!user &&
    user.status === 'active' &&
    !!user.passwordHash &&
    (await verifyPassword(user.passwordHash, input.password));
  if (!user || !ok) {
    if (!user || !user.passwordHash) await burnVerification(input.password);
    await recordAttempt(db, 'login', email, input.ip, false);
    // Nunca grava o e-mail digitado (pode ser, por engano, uma senha): só um prefixo do hash.
    await audit(db, {
      // Com conta conhecida, o evento aparece na auditoria da organização dela.
      organizationId: user ? await defaultOrganizationId(db, user.id) : null,
      actorUserId: user?.id ?? null,
      action: 'auth.login_failed',
      metadata: { subject: sha256Hex(email).slice(0, 12) },
      ip: input.ip,
    });
    throw BAD_LOGIN();
  }

  const organizationId = await defaultOrganizationId(db, user.id);
  if (!organizationId && user.isPlatformAdmin !== 1) {
    throw new AppError('FORBIDDEN', 'Sua conta ainda não está vinculada a nenhuma organização.');
  }
  await recordAttempt(db, 'login', email, input.ip, true);
  const session = await createSession(db, {
    userId: user.id,
    organizationId,
    ip: input.ip,
    userAgent: input.userAgent,
    now,
  });
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  await audit(db, {
    organizationId,
    actorUserId: user.id,
    action: 'auth.login',
    entityType: 'session',
    entityId: session.sessionId,
    ip: input.ip,
  });
  return { token: session.token, expiresAt: session.expiresAt, userId: user.id };
}

export async function logout(db: Db, ctx: Ctx): Promise<void> {
  if (!ctx.sessionId) return;
  await revokeSession(db, ctx.sessionId, ctx.userId);
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'auth.logout',
    entityType: 'session',
    entityId: ctx.sessionId,
    ip: ctx.ip,
  });
}

// ---------------------------------------------------------------- convites

export type InvitationLookup =
  | { status: 'invalid' }
  | {
      status: 'valid';
      invitationId: string;
      organizationId: string;
      email: string;
      name: string;
      roleName: string;
      userExists: boolean;
    };

/** Consulta de leitura usada pela página do convite. Falhas contam no limite por IP. */
export async function lookupInvitation(
  db: Db,
  token: string,
  ip: string,
  now = new Date(),
): Promise<InvitationLookup> {
  await assertTokenAllowed(db, ip, now);
  const [inv] = await db
    .select({ inv: invitations, roleName: roles.name })
    .from(invitations)
    .innerJoin(roles, eq(roles.id, invitations.roleId))
    .where(eq(invitations.tokenHash, sha256Hex(token)))
    .limit(1);
  if (
    !inv ||
    inv.inv.acceptedAt ||
    inv.inv.revokedAt ||
    inv.inv.expiresAt.getTime() <= now.getTime()
  ) {
    await recordAttempt(db, 'token', 'invalid', ip, false);
    return { status: 'invalid' };
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, inv.inv.email))
    .limit(1);
  return {
    status: 'valid',
    invitationId: inv.inv.id,
    organizationId: inv.inv.organizationId,
    email: inv.inv.email,
    name: inv.inv.name,
    roleName: inv.roleName,
    userExists: !!existing,
  };
}

/**
 * Aceita o convite. Conta nova: define senha e entra. Conta já existente: exige estar autenticado
 * como a própria pessoa convidada (o link sozinho nunca anexa vínculos a uma conta alheia).
 */
export async function acceptInvitation(
  db: Db,
  input: {
    token: string;
    password?: string;
    name?: string;
    currentUserId?: string | null;
  } & Origin,
  now = new Date(),
) {
  await assertTokenAllowed(db, input.ip, now);
  const tokenHash = sha256Hex(input.token);

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ inv: invitations, role: roles })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(eq(invitations.tokenHash, tokenHash))
      .for('update')
      .limit(1);
    const inv = row?.inv;
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt.getTime() <= now.getTime())
      throw BAD_TOKEN();

    const [existing] = await tx.select().from(users).where(eq(users.email, inv.email)).limit(1);
    let userId: string;
    if (existing) {
      if (input.currentUserId !== existing.id) {
        throw new AppError(
          'UNAUTHENTICATED',
          'Entre com a conta convidada para aceitar este convite.',
        );
      }
      if (existing.kind !== row!.role.kind) {
        throw new AppError('CONFLICT', 'O tipo da conta não é compatível com esta função.');
      }
      userId = existing.id;
    } else {
      const password = input.password ?? '';
      const problems = validatePassword(password, { email: inv.email, name: inv.name });
      if (problems.length) throw new AppError('VALIDATION', problems[0]!, { password: problems });
      userId = newId();
      await tx.insert(users).values({
        id: userId,
        email: inv.email,
        name: (input.name?.trim() || inv.name).slice(0, 190),
        passwordHash: await hashPassword(password),
        kind: row!.role.kind,
      });
    }
    await tx
      .insert(memberships)
      .values({
        id: newId(),
        organizationId: inv.organizationId,
        userId,
        roleId: inv.roleId,
        scopeType: inv.scopeType,
        clientId: inv.clientId,
        scopeKey: inv.clientId ?? '*',
      })
      .onDuplicateKeyUpdate({ set: { roleId: inv.roleId } });
    await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, inv.id));
    await audit(tx, {
      organizationId: inv.organizationId,
      actorUserId: userId,
      action: 'invitation.accepted',
      entityType: 'invitation',
      entityId: inv.id,
      metadata: { roleId: inv.roleId, newAccount: !existing },
      ip: input.ip,
    });
    return {
      userId,
      organizationId: inv.organizationId,
      newAccount: !existing,
      invitedBy: inv.createdBy,
      inviteeName: (input.name?.trim() || inv.name) as string,
    };
  });

  await recordAttempt(db, 'token', 'invitation', input.ip, true);
  await notify(db, {
    organizationId: result.organizationId,
    userId: result.invitedBy,
    type: 'invitation_accepted',
    title: `${result.inviteeName} aceitou o convite`,
    body: 'A pessoa já tem acesso à organização.',
    link: '/equipe',
  });
  // Conta nova entra direto; conta existente já está autenticada e mantém a sessão atual.
  if (!result.newAccount) return { ...result, token: null as string | null };
  const session = await createSession(db, {
    userId: result.userId,
    organizationId: result.organizationId,
    ip: input.ip,
    userAgent: input.userAgent,
    now,
  });
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, result.userId));
  return { ...result, token: session.token as string | null };
}

// ----------------------------------------------------- redefinição de senha

/** Gera o link de definição/redefinição de senha. O token em claro só existe nesta resposta. */
export async function issuePasswordReset(
  db: Db,
  input: { userId: string; createdBy: string | null; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + RESET_TTL_MS);
  await db.transaction(async (tx) => {
    // Invalida links anteriores ainda pendentes.
    await tx
      .update(passwordResets)
      .set({ usedAt: now })
      .where(and(eq(passwordResets.userId, input.userId), isNull(passwordResets.usedAt)));
    await tx.insert(passwordResets).values({
      id: newId(),
      userId: input.userId,
      tokenHash: sha256Hex(token),
      expiresAt,
      createdBy: input.createdBy,
    });
  });
  return { token, expiresAt };
}

export async function lookupPasswordReset(db: Db, token: string, ip: string, now = new Date()) {
  await assertTokenAllowed(db, ip, now);
  const [row] = await db
    .select({ r: passwordResets, name: users.name, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(eq(passwordResets.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row || row.r.usedAt || row.r.expiresAt.getTime() <= now.getTime()) {
    await recordAttempt(db, 'token', 'invalid', ip, false);
    return null;
  }
  return { name: row.name, email: row.email };
}

export async function completePasswordReset(
  db: Db,
  input: { token: string; password: string; ip: string },
  now = new Date(),
): Promise<void> {
  await assertTokenAllowed(db, input.ip, now);
  await db
    .transaction(async (tx) => {
      const [row] = await tx
        .select({ r: passwordResets, u: users })
        .from(passwordResets)
        .innerJoin(users, eq(users.id, passwordResets.userId))
        .where(eq(passwordResets.tokenHash, sha256Hex(input.token)))
        .for('update')
        .limit(1);
      if (!row || row.r.usedAt || row.r.expiresAt.getTime() <= now.getTime()) {
        throw BAD_TOKEN();
      }
      const problems = validatePassword(input.password, { email: row.u.email, name: row.u.name });
      if (problems.length) throw new AppError('VALIDATION', problems[0]!, { password: problems });
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(input.password) })
        .where(eq(users.id, row.u.id));
      await tx.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, row.r.id));
      await revokeAllSessions(tx as unknown as Db, row.u.id);
      await audit(tx, {
        organizationId: null,
        actorUserId: row.u.id,
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: row.u.id,
        ip: input.ip,
      });
    })
    .catch(async (e) => {
      if (e instanceof AppError && e.code === 'NOT_FOUND')
        await recordAttempt(db, 'token', 'invalid', input.ip, false);
      throw e;
    });
}

// ------------------------------------------------------------ minhas sessões

export async function mySessions(db: Db, ctx: Ctx) {
  const rows = await listActiveSessions(db, ctx.userId);
  return rows.map((s) => ({
    id: s.id,
    current: s.id === ctx.sessionId,
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    lastSeenAt: s.lastSeenAt,
  }));
}

export async function revokeMySession(db: Db, ctx: Ctx, sessionId: string): Promise<void> {
  const ok = await revokeSession(db, sessionId, ctx.userId);
  if (!ok) throw new AppError('NOT_FOUND', 'Sessão não encontrada.');
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'session.revoked',
    entityType: 'session',
    entityId: sessionId,
    ip: ctx.ip,
  });
}

export async function revokeOtherSessions(db: Db, ctx: Ctx): Promise<number> {
  const n = await revokeAllSessions(db, ctx.userId, ctx.sessionId ?? undefined);
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'session.revoked_others',
    metadata: { count: n },
    ip: ctx.ip,
  });
  return n;
}
