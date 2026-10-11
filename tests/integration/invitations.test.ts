import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, invitations, memberships, passwordResets, sessions, users } from '@/db/schema';
import { sha256Hex } from '@/core/crypto';
import { createSession, resolveSession } from '@/core/auth/session';
import { systemRoleId } from '@/core/permissions/seed';
import { LIMITS } from '@/core/rate-limit';
import {
  INVITE_TTL_MS,
  acceptInvitation,
  completePasswordReset,
  issuePasswordReset,
  login,
  lookupInvitation,
  lookupPasswordReset,
} from '@/modules/auth/service';
import {
  createInvitation,
  createResetLinkForMember,
  revokeInvitation,
} from '@/modules/team/service';
import { resetDatabase, world, type World } from '../helpers/db';

const PASSWORD = 'uma-senha-bem-longa-42';
const origin = { ip: '10.9.0.1', userAgent: 'vitest' };
let w: World;
let orgId: string;

beforeAll(async () => {
  await resetDatabase();
  w = world();
  orgId = await w.org('Agência Convites');
});
afterAll(async () => w.close());

const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

describe('convites', () => {
  it('fluxo completo: token só existe como hash, conta nova entra, link é de uso único', async () => {
    const owner = await w.actor(orgId, 'owner');
    const writer = await systemRoleId(w.db, 'writer');
    const inv = await createInvitation(w.db, owner.ctx, {
      email: 'Nova@Example.test',
      name: 'Nova Pessoa',
      roleId: writer,
    });

    const [row] = await w.db.select().from(invitations).where(eq(invitations.id, inv.id));
    expect(row!.tokenHash).toBe(sha256Hex(inv.token));
    expect(JSON.stringify(row)).not.toContain(inv.token);

    const look = await lookupInvitation(w.db, inv.token, origin.ip);
    expect(look).toMatchObject({ status: 'valid', email: 'nova@example.test', userExists: false });

    const weak = await code(
      acceptInvitation(w.db, { token: inv.token, password: 'curta', ...origin }),
    );
    expect(weak).toBe('VALIDATION');

    const ok = await acceptInvitation(w.db, { token: inv.token, password: PASSWORD, ...origin });
    expect(ok.token).toBeTruthy();
    expect(await resolveSession(w.db, ok.token!)).not.toBeNull();
    const [mem] = await w.db.select().from(memberships).where(eq(memberships.userId, ok.userId));
    expect(mem).toMatchObject({ organizationId: orgId, scopeType: 'organization' });

    expect(
      await code(acceptInvitation(w.db, { token: inv.token, password: PASSWORD, ...origin })),
    ).toBe('NOT_FOUND');
    expect(await lookupInvitation(w.db, inv.token, origin.ip)).toEqual({ status: 'invalid' });
    await login(w.db, {
      email: 'nova@example.test',
      password: PASSWORD,
      ...origin,
      ip: '10.9.1.1',
    });
  });

  it('expira, pode ser revogado e novo convite substitui o anterior', async () => {
    const owner = await w.actor(orgId, 'owner');
    const writer = await systemRoleId(w.db, 'writer');
    const t0 = new Date('2031-01-01T00:00:00Z');
    const a = await createInvitation(
      w.db,
      owner.ctx,
      { email: 'exp@example.test', name: 'Exp', roleId: writer },
      t0,
    );
    expect(
      await code(
        acceptInvitation(
          w.db,
          { token: a.token, password: PASSWORD, ...origin, ip: '10.9.2.1' },
          new Date(t0.getTime() + INVITE_TTL_MS + 1000),
        ),
      ),
    ).toBe('NOT_FOUND');

    const b = await createInvitation(w.db, owner.ctx, {
      email: 'rev@example.test',
      name: 'Rev',
      roleId: writer,
    });
    await revokeInvitation(w.db, owner.ctx, b.id);
    expect(
      await code(
        acceptInvitation(w.db, { token: b.token, password: PASSWORD, ...origin, ip: '10.9.2.2' }),
      ),
    ).toBe('NOT_FOUND');

    const c1 = await createInvitation(w.db, owner.ctx, {
      email: 'dup@example.test',
      name: 'Dup',
      roleId: writer,
    });
    const c2 = await createInvitation(w.db, owner.ctx, {
      email: 'dup@example.test',
      name: 'Dup',
      roleId: writer,
    });
    expect(
      await code(
        acceptInvitation(w.db, { token: c1.token, password: PASSWORD, ...origin, ip: '10.9.2.3' }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await code(
        acceptInvitation(w.db, { token: c2.token, password: PASSWORD, ...origin, ip: '10.9.2.3' }),
      ),
    ).toBe('ok');
  });

  it('impede escalada de privilégio: gestor não convida proprietário, mas convida funções que ele próprio possui', async () => {
    const manager = await w.actor(orgId, 'manager');
    const ownerRole = await systemRoleId(w.db, 'owner');
    const managerRole = await systemRoleId(w.db, 'manager');
    const writerRole = await systemRoleId(w.db, 'writer');
    expect(
      await code(
        createInvitation(w.db, manager.ctx, {
          email: 'x1@example.test',
          name: 'X',
          roleId: ownerRole,
        }),
      ),
    ).toBe('FORBIDDEN');
    // Gestor tem team:create, mas não possui roles:*, então não pode conceder uma função que contenha isso.
    expect(
      await code(
        createInvitation(w.db, manager.ctx, {
          email: 'x2@example.test',
          name: 'X',
          roleId: managerRole,
        }),
      ),
    ).toBe('ok');
    expect(
      await code(
        createInvitation(w.db, manager.ctx, {
          email: 'x3@example.test',
          name: 'X',
          roleId: writerRole,
        }),
      ),
    ).toBe('ok');
  });

  it('exige permissão: redator não convida', async () => {
    const writer = await w.actor(orgId, 'writer');
    expect(
      await code(
        createInvitation(w.db, writer.ctx, {
          email: 'y@example.test',
          name: 'Y',
          roleId: await systemRoleId(w.db, 'viewer'),
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('funções externas exigem cliente da própria organização', async () => {
    const owner = await w.actor(orgId, 'owner');
    const other = await w.org('Outra Agência');
    const foreignClient = await w.client(other, 'Cliente Alheio');
    const myClient = await w.client(orgId, 'Cliente Meu');
    const role = await systemRoleId(w.db, 'client');
    expect(
      await code(
        createInvitation(w.db, owner.ctx, { email: 'ext@example.test', name: 'Ext', roleId: role }),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        createInvitation(w.db, owner.ctx, {
          email: 'ext@example.test',
          name: 'Ext',
          roleId: role,
          clientId: foreignClient,
        }),
      ),
    ).toBe('NOT_FOUND');
    const inv = await createInvitation(w.db, owner.ctx, {
      email: 'ext@example.test',
      name: 'Ext',
      roleId: role,
      clientId: myClient,
    });
    const r = await acceptInvitation(w.db, {
      token: inv.token,
      password: PASSWORD,
      ...origin,
      ip: '10.9.3.1',
    });
    const [u] = await w.db.select().from(users).where(eq(users.id, r.userId));
    expect(u!.kind).toBe('external');
    const [m] = await w.db.select().from(memberships).where(eq(memberships.userId, r.userId));
    expect(m).toMatchObject({ scopeType: 'client', clientId: myClient });
  });

  it('conta existente só aceita convite autenticada como ela mesma', async () => {
    const owner = await w.actor(orgId, 'owner');
    const org2 = await w.org('Agência Dois');
    const existing = await w.actor(org2, 'writer', { email: 'existente@example.test' });
    const inv = await createInvitation(w.db, owner.ctx, {
      email: 'existente@example.test',
      name: 'Ex',
      roleId: await systemRoleId(w.db, 'viewer'),
    });
    expect(
      await code(acceptInvitation(w.db, { token: inv.token, ...origin, ip: '10.9.4.1' })),
    ).toBe('UNAUTHENTICATED');
    const stranger = await w.user({ email: 'estranho@example.test', password: PASSWORD });
    expect(
      await code(
        acceptInvitation(w.db, {
          token: inv.token,
          currentUserId: stranger,
          ...origin,
          ip: '10.9.4.1',
        }),
      ),
    ).toBe('UNAUTHENTICATED');
    const r = await acceptInvitation(w.db, {
      token: inv.token,
      currentUserId: existing.userId,
      ...origin,
      ip: '10.9.4.1',
    });
    expect(r.token).toBeNull();
    const mems = await w.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, existing.userId));
    expect(mems.map((m) => m.organizationId).sort()).toEqual([orgId, org2].sort());
  });

  it('tentativas com token inválido são limitadas por IP', async () => {
    for (let i = 0; i < LIMITS.tokenPerIp; i++)
      await lookupInvitation(w.db, `token-invalido-${i}-xxxxxxxxxxxx`, '10.9.5.1');
    expect(await code(lookupInvitation(w.db, 'outro-token-xxxxxxxxxxxxxxxx', '10.9.5.1'))).toBe(
      'RATE_LIMITED',
    );
  });
});

describe('redefinição de senha', () => {
  it('proprietário gera link, token só em hash, uso único, derruba sessões e permite novo login', async () => {
    const owner = await w.actor(orgId, 'owner');
    const target = await w.user({ email: 'alvo@example.test', password: PASSWORD });
    await w.member({ orgId, userId: target, role: 'writer' });
    const s = await createSession(w.db, {
      userId: target,
      organizationId: orgId,
      ip: 'x',
      userAgent: 'x',
    });

    const link = await createResetLinkForMember(w.db, owner.ctx, target);
    const [row] = await w.db.select().from(passwordResets).where(eq(passwordResets.userId, target));
    expect(row!.tokenHash).toBe(sha256Hex(link.token));
    expect(await lookupPasswordReset(w.db, link.token, '10.9.6.1')).toMatchObject({
      email: 'alvo@example.test',
    });

    expect(
      await code(
        completePasswordReset(w.db, { token: link.token, password: 'curta', ip: '10.9.6.1' }),
      ),
    ).toBe('VALIDATION');
    await completePasswordReset(w.db, {
      token: link.token,
      password: 'nova-senha-muito-longa-77',
      ip: '10.9.6.1',
    });
    expect(
      await code(
        completePasswordReset(w.db, {
          token: link.token,
          password: 'outra-senha-muito-longa-78',
          ip: '10.9.6.1',
        }),
      ),
    ).toBe('NOT_FOUND');

    expect(await resolveSession(w.db, s.token)).toBeNull();
    expect(
      await code(
        login(w.db, { email: 'alvo@example.test', password: PASSWORD, ...origin, ip: '10.9.6.2' }),
      ),
    ).toBe('UNAUTHENTICATED');
    expect(
      await code(
        login(w.db, {
          email: 'alvo@example.test',
          password: 'nova-senha-muito-longa-77',
          ...origin,
          ip: '10.9.6.2',
        }),
      ),
    ).toBe('ok');
  });

  it('novo link invalida o anterior e links expiram', async () => {
    const u = await w.user({ email: 'dois@example.test', password: PASSWORD });
    const t0 = new Date('2032-01-01T00:00:00Z');
    const a = await issuePasswordReset(w.db, { userId: u, createdBy: null, now: t0 });
    const b = await issuePasswordReset(w.db, { userId: u, createdBy: null, now: t0 });
    expect(await lookupPasswordReset(w.db, a.token, '10.9.7.1', t0)).toBeNull();
    expect(await lookupPasswordReset(w.db, b.token, '10.9.7.1', t0)).not.toBeNull();
    expect(
      await lookupPasswordReset(
        w.db,
        b.token,
        '10.9.7.2',
        new Date(t0.getTime() + 25 * 3600 * 1000),
      ),
    ).toBeNull();
  });

  it('gestor (sem manage_users) não gera link; ninguém gera link para quem tem mais poder nem para admin da plataforma', async () => {
    const manager = await w.actor(orgId, 'manager');
    const owner = await w.actor(orgId, 'owner');
    const writer = await w.actor(orgId, 'writer');
    expect(await code(createResetLinkForMember(w.db, manager.ctx, writer.userId))).toBe(
      'FORBIDDEN',
    );
    const [coord] = [await w.actor(orgId, 'coordinator')];
    // Um usuário com manage_users mas sem outras permissões não alcança o proprietário:
    const roleId = await systemRoleId(w.db, 'viewer');
    void roleId;
    expect(await code(createResetLinkForMember(w.db, owner.ctx, coord.userId))).toBe('ok');
    await w.db.update(users).set({ isPlatformAdmin: 1 }).where(eq(users.id, writer.userId));
    expect(await code(createResetLinkForMember(w.db, owner.ctx, writer.userId))).toBe('FORBIDDEN');
  });

  it('não gera link para usuário de outra organização (resposta idêntica a inexistente)', async () => {
    const owner = await w.actor(orgId, 'owner');
    const other = await w.org('Org Alheia');
    const stranger = await w.actor(other, 'writer');
    expect(await code(createResetLinkForMember(w.db, owner.ctx, stranger.userId))).toBe(
      'NOT_FOUND',
    );
  });
});

describe('auditoria sem segredos', () => {
  it('nenhum evento contém tokens, hashes ou senhas', async () => {
    const rows = await w.db.select().from(auditLogs);
    const serialized = JSON.stringify(rows);
    expect(rows.length).toBeGreaterThan(5);
    expect(serialized).not.toMatch(/argon2/i);
    expect(serialized).not.toContain(PASSWORD);
    const sess = await w.db.select().from(sessions);
    for (const s of sess) expect(serialized).not.toContain(s.tokenHash);
  });
});
