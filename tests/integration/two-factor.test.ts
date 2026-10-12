import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, recoveryCodes, users } from '@/db/schema';
import { hotp, base32Decode } from '@/core/totp';
import { login } from '@/modules/auth/service';
import {
  beginSetup,
  disableTwoFactor,
  enableTwoFactor,
  regenerateRecoveryCodes,
  twoFactorStatus,
} from '@/modules/auth/twofactor';
import { resetTwoFactorForMember } from '@/modules/team/service';
import { resetDatabase, world, type World } from '../helpers/db';

let w: World;
let orgId: string;
const PASSWORD = 'senha-forte-para-testes-123';
const origin = { ip: '10.0.0.9', userAgent: 'vitest' };
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );
const otp = (secret: string, now: Date) => hotp(secret, Math.floor(now.getTime() / 30000));
void base32Decode;

async function actor(email: string) {
  const userId = await w.user({ email, password: PASSWORD });
  await w.member({ orgId, userId, role: 'writer' });
  return { userId, email, ctx: await w.ctx(userId, orgId) };
}

beforeAll(async () => {
  await resetDatabase();
  w = world();
  orgId = await w.org('Agência 2FA');
});
afterAll(() => w.close());

describe('autenticação em dois fatores', () => {
  it('sem 2FA o login segue normal; setup só vale depois de confirmar com código', async () => {
    const a = await actor('sem2fa@example.test');
    expect(await twoFactorStatus(w.db, a.ctx)).toMatchObject({ enabled: false, available: true });
    const r = await login(w.db, { email: a.email, password: PASSWORD, ...origin });
    expect(r.twoFactorRequired).toBe(false);
    const { secret, uri } = await beginSetup(w.db, a.ctx);
    expect(uri).toContain(secret);
    // segredo guardado cifrado, nunca em claro
    const [u] = await w.db.select().from(users).where(eq(users.id, a.userId));
    expect(u!.totpSecretEnc).toBeTruthy();
    expect(u!.totpSecretEnc).not.toContain(secret);
    // enquanto não confirmado, o login não pede código
    expect(
      (await login(w.db, { email: a.email, password: PASSWORD, ...origin })).twoFactorRequired,
    ).toBe(false);
    expect(await code(enableTwoFactor(w.db, a.ctx, '000000'))).toBe('VALIDATION');
    const { recoveryCodes: codes } = await enableTwoFactor(w.db, a.ctx, otp(secret, new Date()));
    expect(codes).toHaveLength(10);
    expect(await twoFactorStatus(w.db, a.ctx)).toMatchObject({
      enabled: true,
      recoveryCodesRemaining: 10,
    });
    // códigos de recuperação guardados só como hash
    const rows = await w.db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, a.userId));
    expect(JSON.stringify(rows)).not.toContain(codes[0]!.replace('-', ''));
    expect(await code(beginSetup(w.db, a.ctx))).toBe('CONFLICT');
  });

  it('login exige segundo fator; código errado, repetido ou expirado é recusado; recuperação vale uma vez', async () => {
    const a = await actor('com2fa@example.test');
    const { secret } = await beginSetup(w.db, a.ctx);
    const t0 = new Date('2031-05-01T12:00:00Z');
    const { recoveryCodes: codes } = await enableTwoFactor(w.db, a.ctx, otp(secret, t0), t0);

    const first = await login(w.db, { email: a.email, password: PASSWORD, ...origin }, t0);
    expect(first).toEqual({ twoFactorRequired: true }); // senha certa, mas sem sessão
    expect(
      await code(
        login(w.db, { email: a.email, password: PASSWORD, code: '123456', ...origin }, t0),
      ),
    ).toBe('UNAUTHENTICATED');
    const t1 = new Date(t0.getTime() + 60_000);
    const ok = await login(
      w.db,
      { email: a.email, password: PASSWORD, code: otp(secret, t1), ...origin },
      t1,
    );
    expect(ok.twoFactorRequired).toBe(false);
    // o mesmo código não serve duas vezes (replay)
    expect(
      await code(
        login(w.db, { email: a.email, password: PASSWORD, code: otp(secret, t1), ...origin }, t1),
      ),
    ).toBe('UNAUTHENTICATED');
    // senha errada nunca chega a pedir código
    expect(
      await code(
        login(
          w.db,
          { email: a.email, password: 'errada-errada-123', code: otp(secret, t1), ...origin },
          t1,
        ),
      ),
    ).toBe('UNAUTHENTICATED');
    // recuperação: uma vez só
    const t2 = new Date(t1.getTime() + 120_000);
    const rec = codes[0]!;
    expect(
      (
        await login(
          w.db,
          { email: a.email, password: PASSWORD, code: rec.toUpperCase(), ...origin },
          t2,
        )
      ).twoFactorRequired,
    ).toBe(false);
    expect(
      await code(login(w.db, { email: a.email, password: PASSWORD, code: rec, ...origin }, t2)),
    ).toBe('UNAUTHENTICATED');
    expect((await twoFactorStatus(w.db, a.ctx)).recoveryCodesRemaining).toBe(9);
    const actions = (
      await w.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, a.userId))
    ).map((x) => x.action);
    expect(actions).toEqual(
      expect.arrayContaining(['auth.2fa_enabled', 'auth.2fa_failed', 'auth.2fa_recovery_used']),
    );
  });

  it('dois logins simultâneos com o mesmo código: só um passa', async () => {
    const a = await actor('corrida2fa@example.test');
    const { secret } = await beginSetup(w.db, a.ctx);
    const t0 = new Date('2031-06-01T12:00:00Z');
    await enableTwoFactor(w.db, a.ctx, otp(secret, t0), t0);
    const t1 = new Date(t0.getTime() + 90_000);
    const c = otp(secret, t1);
    const res = await Promise.allSettled([
      login(w.db, { email: a.email, password: PASSWORD, code: c, ...origin }, t1),
      login(w.db, { email: a.email, password: PASSWORD, code: c, ...origin }, t1),
    ]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('desativar e regenerar exigem senha e código; tentativas erradas esgotam o limite', async () => {
    const a = await actor('gerencia2fa@example.test');
    const { secret } = await beginSetup(w.db, a.ctx);
    const t0 = new Date('2031-07-01T12:00:00Z');
    const { recoveryCodes: old } = await enableTwoFactor(w.db, a.ctx, otp(secret, t0), t0);
    const t1 = new Date(t0.getTime() + 60_000);
    expect(
      await code(
        disableTwoFactor(w.db, a.ctx, { password: 'errada-errada-123', code: otp(secret, t1) }, t1),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(disableTwoFactor(w.db, a.ctx, { password: PASSWORD, code: '000000' }, t1)),
    ).toBe('VALIDATION');
    const t2 = new Date(t1.getTime() + 60_000);
    const fresh = await regenerateRecoveryCodes(
      w.db,
      a.ctx,
      { password: PASSWORD, code: otp(secret, t2) },
      t2,
    );
    expect(fresh.recoveryCodes).toHaveLength(10);
    expect(fresh.recoveryCodes).not.toContain(old[0]);
    // código antigo de recuperação deixou de valer
    const t3 = new Date(t2.getTime() + 60_000);
    expect(
      await code(login(w.db, { email: a.email, password: PASSWORD, code: old[0]!, ...origin }, t3)),
    ).toBe('UNAUTHENTICATED');
    const t4 = new Date(t3.getTime() + 60_000);
    await disableTwoFactor(w.db, a.ctx, { password: PASSWORD, code: otp(secret, t4) }, t4);
    expect((await twoFactorStatus(w.db, a.ctx)).enabled).toBe(false);
    expect(
      await w.db.select().from(recoveryCodes).where(eq(recoveryCodes.userId, a.userId)),
    ).toHaveLength(0);
    expect(
      (await login(w.db, { email: a.email, password: PASSWORD, ...origin }, t4)).twoFactorRequired,
    ).toBe(false);
    // tentativas erradas repetidas travam (mesmo limite do login)
    const b = await actor('forca-bruta@example.test');
    const { secret: s2 } = await beginSetup(w.db, b.ctx);
    await enableTwoFactor(w.db, b.ctx, otp(s2, t0), t0);
    const results: string[] = [];
    for (let i = 0; i < 7; i++)
      results.push(
        await code(disableTwoFactor(w.db, b.ctx, { password: PASSWORD, code: '000000' })),
      );
    expect(results.slice(0, 5)).toEqual(Array(5).fill('VALIDATION'));
    expect(results.slice(5)).toEqual(['RATE_LIMITED', 'RATE_LIMITED']);
  });
});

describe('recuperação administrativa', () => {
  it('administrador remove o 2FA de quem perdeu o aparelho; regras de escalada e autoatendimento', async () => {
    const owner = await w.actor(orgId, 'owner');
    const manager = await w.actor(orgId, 'manager');
    const victim = await actor('perdeu-aparelho@example.test');
    const { secret } = await beginSetup(w.db, victim.ctx);
    await enableTwoFactor(w.db, victim.ctx, otp(secret, new Date()));
    // quem não tem team:manage_users não pode; ninguém reseta a si mesmo por aqui
    expect(await code(resetTwoFactorForMember(w.db, victim.ctx, victim.userId))).toBe('FORBIDDEN');
    expect(await code(resetTwoFactorForMember(w.db, manager.ctx, victim.userId))).toBe('FORBIDDEN');
    expect(await code(resetTwoFactorForMember(w.db, owner.ctx, owner.userId))).toBe('FORBIDDEN');
    // usuário de outra organização é indistinguível de inexistente
    const other = await w.org('Outra');
    const stranger = await w.actor(other, 'owner');
    expect(await code(resetTwoFactorForMember(w.db, stranger.ctx, victim.userId))).toBe(
      'NOT_FOUND',
    );
    await resetTwoFactorForMember(w.db, owner.ctx, victim.userId);
    expect((await twoFactorStatus(w.db, victim.ctx)).enabled).toBe(false);
    expect(
      (await login(w.db, { email: victim.email, password: PASSWORD, ...origin })).twoFactorRequired,
    ).toBe(false);
    expect(await code(resetTwoFactorForMember(w.db, owner.ctx, victim.userId))).toBe('CONFLICT'); // já sem 2FA
    const actions = (
      await w.db.select().from(auditLogs).where(eq(auditLogs.actorUserId, owner.userId))
    ).map((a) => a.action);
    expect(actions).toContain('user.2fa_reset');
  });
});
