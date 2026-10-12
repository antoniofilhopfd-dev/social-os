import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, authAttempts, users } from '@/db/schema';
import { AppError } from '@/core/errors';
import { LIMITS } from '@/core/rate-limit';
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  createSession,
  resolveSession,
  revokeAllSessions,
  revokeSession,
} from '@/core/auth/session';
import { validatePassword } from '@/core/password';
import { login } from '@/modules/auth/service';
import { resetDatabase, world, type World } from '../helpers/db';

const PASSWORD = 'uma-senha-bem-longa-42';
const origin = { ip: '10.0.0.1', userAgent: 'vitest' };
let w: World;
let orgId: string;

beforeAll(async () => {
  await resetDatabase();
  w = world();
  orgId = await w.org('Agência Auth');
});
afterAll(async () => w.close());

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe('login', () => {
  it('autentica, cria sessão, registra auditoria e guarda a senha apenas como hash argon2id', async () => {
    const userId = await w.user({ email: 'ana@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    const r = await login(w.db, { email: ' ANA@example.test ', password: PASSWORD, ...origin });
    expect(r.twoFactorRequired === false && r.token.length).toBeGreaterThan(30);
    const [u] = await w.db.select().from(users).where(eq(users.id, userId));
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u!.passwordHash).not.toContain(PASSWORD);
    expect(u!.lastLoginAt).not.toBeNull();
    const logs = await w.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, userId));
    expect(logs.map((l) => l.action)).toContain('auth.login');
  });

  it('devolve a mesma mensagem para senha errada e e-mail inexistente (sem enumeração de contas)', async () => {
    const a = await login(w.db, {
      email: 'ana@example.test',
      password: 'errada-errada-1',
      ...origin,
      ip: '10.0.0.2',
    }).catch((e) => e);
    const b = await login(w.db, {
      email: 'ninguem@example.test',
      password: 'errada-errada-1',
      ...origin,
      ip: '10.0.0.3',
    }).catch((e) => e);
    expect(a).toBeInstanceOf(AppError);
    expect(a.code).toBe('UNAUTHENTICATED');
    expect(a.message).toBe(b.message);
  });

  it('não grava o e-mail digitado na auditoria de falha', async () => {
    await login(w.db, {
      email: 'segredo-digitado@example.test',
      password: 'x'.repeat(14),
      ...origin,
      ip: '10.0.0.4',
    }).catch(() => undefined);
    const logs = await w.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'auth.login_failed'));
    expect(JSON.stringify(logs)).not.toContain('segredo-digitado');
  });

  it('bloqueia após exceder tentativas, mesmo com a senha correta', async () => {
    const userId = await w.user({ email: 'bloqueio@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    for (let i = 0; i < LIMITS.loginPerEmail; i++) {
      await expectCode(
        login(w.db, {
          email: 'bloqueio@example.test',
          password: 'errada-errada-1',
          ...origin,
          ip: `10.1.0.${i}`,
        }),
        'UNAUTHENTICATED',
      );
    }
    await expectCode(
      login(w.db, {
        email: 'bloqueio@example.test',
        password: PASSWORD,
        ...origin,
        ip: '10.1.9.9',
      }),
      'RATE_LIMITED',
    );
    const rows = await w.db.select().from(authAttempts);
    expect(rows.length).toBeGreaterThanOrEqual(LIMITS.loginPerEmail);
  });

  it('bloqueia por IP quando muitos e-mails diferentes falham', async () => {
    for (let i = 0; i < LIMITS.loginPerIp; i++) {
      await login(w.db, {
        email: `x${i}@example.test`,
        password: 'errada-errada-1',
        ...origin,
        ip: '10.2.0.1',
      }).catch(() => undefined);
    }
    await expectCode(
      login(w.db, { email: 'ana@example.test', password: PASSWORD, ...origin, ip: '10.2.0.1' }),
      'RATE_LIMITED',
    );
  }, 60_000);

  it('não permite login de usuário desativado nem sem senha definida', async () => {
    const off = await w.user({ email: 'off@example.test', password: PASSWORD });
    await w.member({ orgId, userId: off, role: 'writer' });
    await w.db.update(users).set({ status: 'disabled' }).where(eq(users.id, off));
    await expectCode(
      login(w.db, { email: 'off@example.test', password: PASSWORD, ...origin, ip: '10.3.0.1' }),
      'UNAUTHENTICATED',
    );
    const nopw = await w.user({ email: 'nopw@example.test' });
    await w.member({ orgId, userId: nopw, role: 'writer' });
    await expectCode(
      login(w.db, {
        email: 'nopw@example.test',
        password: 'qualquer-coisa-12',
        ...origin,
        ip: '10.3.0.2',
      }),
      'UNAUTHENTICATED',
    );
  });

  it('recusa conta válida sem vínculo com organização', async () => {
    await w.user({ email: 'solta@example.test', password: PASSWORD });
    await expectCode(
      login(w.db, { email: 'solta@example.test', password: PASSWORD, ...origin, ip: '10.3.0.3' }),
      'FORBIDDEN',
    );
  });
});

describe('sessões', () => {
  it('expira por inatividade e por prazo absoluto', async () => {
    const userId = await w.user({ email: 'sess@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    const t0 = new Date('2030-01-01T10:00:00Z');
    const { token } = await createSession(w.db, {
      userId,
      organizationId: orgId,
      ip: 'x',
      userAgent: 'x',
      now: t0,
    });
    expect(await resolveSession(w.db, token, new Date(t0.getTime() + 60_000))).not.toBeNull();
    // Última atividade foi atualizada em t0+60s; passando a janela de inatividade a partir dela:
    expect(
      await resolveSession(w.db, token, new Date(t0.getTime() + 60_000 + SESSION_IDLE_MS + 1000)),
    ).toBeNull();

    const { token: t2 } = await createSession(w.db, {
      userId,
      organizationId: orgId,
      ip: 'x',
      userAgent: 'x',
      now: t0,
    });
    // Ativo continuamente, mas passou do prazo absoluto
    let now = t0.getTime();
    while (now < t0.getTime() + SESSION_ABSOLUTE_MS) {
      now += SESSION_IDLE_MS - 1000;
      if (now >= t0.getTime() + SESSION_ABSOLUTE_MS) break;
      expect(await resolveSession(w.db, t2, new Date(now))).not.toBeNull();
    }
    expect(
      await resolveSession(w.db, t2, new Date(t0.getTime() + SESSION_ABSOLUTE_MS + 1000)),
    ).toBeNull();
  });

  it('revogar derruba o acesso imediatamente; token adulterado não resolve', async () => {
    const userId = await w.user({ email: 'rev@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    const a = await createSession(w.db, { userId, organizationId: orgId, ip: 'x', userAgent: 'x' });
    const b = await createSession(w.db, { userId, organizationId: orgId, ip: 'x', userAgent: 'x' });
    expect(await resolveSession(w.db, a.token)).not.toBeNull();
    expect(await resolveSession(w.db, a.token + 'x')).toBeNull();
    await revokeSession(w.db, a.sessionId, userId);
    expect(await resolveSession(w.db, a.token)).toBeNull();
    expect(await revokeAllSessions(w.db, userId)).toBe(1);
    expect(await resolveSession(w.db, b.token)).toBeNull();
  });

  it('usuário desativado perde as sessões existentes', async () => {
    const userId = await w.user({ email: 'dis@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    const s = await createSession(w.db, { userId, organizationId: orgId, ip: 'x', userAgent: 'x' });
    await w.db.update(users).set({ status: 'disabled' }).where(eq(users.id, userId));
    expect(await resolveSession(w.db, s.token)).toBeNull();
  });

  it('não grava o token em claro (apenas o hash SHA-256)', async () => {
    const userId = await w.user({ email: 'hash@example.test', password: PASSWORD });
    await w.member({ orgId, userId, role: 'writer' });
    const s = await createSession(w.db, { userId, organizationId: orgId, ip: 'x', userAgent: 'x' });
    const [rows] = await w.pool.query('SELECT token_hash FROM sessions WHERE id = ?', [
      s.sessionId,
    ]);
    const hash = (rows as { token_hash: string }[])[0]!.token_hash;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(s.token);
  });
});

describe('política de senha', () => {
  it.each([
    ['curta', 'abc123', true],
    ['comum', 'password1234', true],
    ['repetida', 'aaaaaaaaaaaaaa', true],
    ['contém o e-mail', 'maria.silva-2024-xx', true],
    ['válida', 'cavalo-bateria-grampo-9', false],
  ])('%s', (_n, pw, bad) => {
    expect(validatePassword(pw, { email: 'maria.silva@example.test' }).length > 0).toBe(bad);
  });
});
