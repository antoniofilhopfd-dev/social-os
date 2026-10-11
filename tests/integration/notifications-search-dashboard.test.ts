import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, invitations, notifications, sessions } from '@/db/schema';
import { buildContext } from '@/core/auth/context';
import { createSession } from '@/core/auth/session';
import { systemRoleId } from '@/core/permissions/seed';
import { acceptInvitation } from '@/modules/auth/service';
import { createClient } from '@/modules/clients/service';
import { getDashboard } from '@/modules/dashboard/service';
import { listAudit } from '@/modules/audit/service';
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  notify,
  setPreference,
  unreadCount,
} from '@/modules/notifications/service';
import { listMyOrganizations, switchOrganization } from '@/modules/organizations/service';
import { searchAll } from '@/modules/search/service';
import {
  changeMemberRole,
  createInvitation,
  createResetLinkForMember,
} from '@/modules/team/service';
import { memberOf, resetDatabase, world, type World } from '../helpers/db';

const PASSWORD = 'uma-senha-bem-longa-42';
let w: World;
let A: string, B: string;
let ownerA: Awaited<ReturnType<World['actor']>>, ownerB: Awaited<ReturnType<World['actor']>>;
let clientA1: string, clientA2: string, clientB1: string;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

beforeAll(async () => {
  await resetDatabase();
  w = world();
  A = await w.org('Agência A');
  B = await w.org('Agência B');
  ownerA = await w.actor(A, 'owner');
  ownerB = await w.actor(B, 'owner');
  clientA1 = (await createClient(w.db, ownerA.ctx, { name: 'Padaria Doce Pão' })).id;
  clientA2 = (await createClient(w.db, ownerA.ctx, { name: 'Pizzaria 100% Forno' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Padaria da Outra Agência' })).id;
});
afterAll(async () => w.close());

describe('notificações', () => {
  it('convite aceito notifica quem convidou; respeita preferência; cada um só vê as suas', async () => {
    const inv = await createInvitation(w.db, ownerA.ctx, {
      email: 'nova1@example.test',
      name: 'Nova Um',
      roleId: await systemRoleId(w.db, 'writer'),
    });
    await acceptInvitation(w.db, {
      token: inv.token,
      password: PASSWORD,
      ip: '10.30.0.1',
      userAgent: 'x',
    });
    const list = await listNotifications(w.db, ownerA.ctx);
    expect(list.items.map((i) => i.title)).toContain('Nova Um aceitou o convite');
    expect(list.unread).toBe(1);
    // Outro usuário (mesma org ou outra) não enxerga
    expect((await listNotifications(w.db, ownerB.ctx)).items).toHaveLength(0);
    const otherInOrgA = await w.actor(A, 'manager');
    expect((await listNotifications(w.db, otherInOrgA.ctx)).items).toHaveLength(0);

    await setPreference(w.db, ownerA.ctx, 'invitation_accepted', false);
    const inv2 = await createInvitation(w.db, ownerA.ctx, {
      email: 'nova2@example.test',
      name: 'Nova Dois',
      roleId: await systemRoleId(w.db, 'writer'),
    });
    await acceptInvitation(w.db, {
      token: inv2.token,
      password: PASSWORD,
      ip: '10.30.0.2',
      userAgent: 'x',
    });
    expect((await listNotifications(w.db, ownerA.ctx)).items.map((i) => i.title)).not.toContain(
      'Nova Dois aceitou o convite',
    );
    expect(
      (await getPreferences(w.db, ownerA.ctx)).find((p) => p.type === 'invitation_accepted')!
        .enabled,
    ).toBe(false);
    await setPreference(w.db, ownerA.ctx, 'invitation_accepted', true);
  });

  it('marcar como lida: só a própria, idempotente; ninguém marca a de outro', async () => {
    const [n] = (await listNotifications(w.db, ownerA.ctx)).items;
    expect(await code(markRead(w.db, ownerB.ctx, n!.id))).toBe('NOT_FOUND');
    const otherInOrgA = await w.actor(A, 'owner');
    expect(await code(markRead(w.db, otherInOrgA.ctx, n!.id))).toBe('NOT_FOUND');
    expect(await unreadCount(w.db, ownerA.ctx)).toBe(1);
    expect(await code(markRead(w.db, ownerA.ctx, n!.id))).toBe('ok');
    expect(await code(markRead(w.db, ownerA.ctx, n!.id))).toBe('ok');
    expect(await unreadCount(w.db, ownerA.ctx)).toBe(0);
  });

  it('mudança de função e link de senha notificam o destinatário; marcar todas funciona', async () => {
    const target = await w.actor(A, 'writer');
    const [mem] = await memberOf(w.db, A, target.userId);
    await changeMemberRole(w.db, ownerA.ctx, mem!.id, await systemRoleId(w.db, 'designer'));
    await createResetLinkForMember(w.db, ownerA.ctx, target.userId);
    const list = await listNotifications(w.db, target.ctx);
    expect(list.items.map((i) => i.title)).toEqual(
      expect.arrayContaining([
        'Sua função foi alterada',
        'Um administrador gerou um link de nova senha para a sua conta',
      ]),
    );
    expect(await markAllRead(w.db, target.ctx)).toBe(2);
    expect(await unreadCount(w.db, target.ctx)).toBe(0);
  });

  it('notificações são por organização: a mesma pessoa em outra org não vê as da primeira', async () => {
    const multi = await w.actor(A, 'writer');
    await w.member({ orgId: B, userId: multi.userId, role: 'viewer' });
    await notify(w.db, {
      organizationId: A,
      userId: multi.userId,
      type: 'role_changed',
      title: 'Só da A',
    });
    expect((await listNotifications(w.db, multi.ctx)).items.map((i) => i.title)).toContain(
      'Só da A',
    );
    const inB = await w.ctx(multi.userId, B);
    expect((await listNotifications(w.db, inB)).items).toHaveLength(0);
  });

  it('recusa links externos e tipos de preferência inválidos', async () => {
    expect(
      await notify(w.db, {
        organizationId: A,
        userId: ownerA.userId,
        type: 'role_changed',
        title: 'x',
        link: 'https://evil.example',
      }),
    ).toBe(false);
    expect(
      await notify(w.db, {
        organizationId: A,
        userId: ownerA.userId,
        type: 'role_changed',
        title: 'x',
        link: '//evil.example',
      }),
    ).toBe(false);
    expect(await code(setPreference(w.db, ownerA.ctx, 'tipo_inexistente', false))).toBe(
      'VALIDATION',
    );
    const rows = await w.db.select().from(notifications).where(eq(notifications.title, 'x'));
    expect(rows).toHaveLength(0);
  });
});

describe('busca global', () => {
  it('encontra clientes da própria organização e ignora termos curtos', async () => {
    const r = await searchAll(w.db, ownerA.ctx, 'padaria');
    expect(r.clients.map((c) => c.name)).toEqual(['Padaria Doce Pão']);
    expect(await searchAll(w.db, ownerA.ctx, 'p')).toEqual({
      clients: [],
      people: [],
      requests: [],
      contents: [],
    });
  });

  it('não vaza dados de outra organização (clientes nem pessoas)', async () => {
    const r = await searchAll(w.db, ownerB.ctx, 'padaria');
    expect(r.clients.map((c) => c.id)).toEqual([clientB1]);
    const people = await searchAll(w.db, ownerB.ctx, 'example.test');
    expect(people.people.every((p) => p.email !== ownerA.email)).toBe(true);
    expect(people.people.map((p) => p.email)).toContain(ownerB.email);
  });

  it('respeita o escopo de cliente e exige team:view para pessoas', async () => {
    const scoped = await w.actor(A, 'viewer', { clientId: clientA1 });
    expect((await searchAll(w.db, scoped.ctx, 'pizzaria')).clients).toEqual([]);
    expect((await searchAll(w.db, scoped.ctx, 'padaria')).clients).toHaveLength(1);
    expect((await searchAll(w.db, scoped.ctx, 'example.test')).people).toEqual([]);
    const writer = await w.actor(A, 'writer');
    expect((await searchAll(w.db, writer.ctx, 'example.test')).people).toEqual([]);
  });

  it('trata curingas do LIKE literalmente (% e _)', async () => {
    expect((await searchAll(w.db, ownerA.ctx, '%')).clients).toEqual([]);
    expect((await searchAll(w.db, ownerA.ctx, '%%')).clients).toEqual([]);
    expect((await searchAll(w.db, ownerA.ctx, '100%')).clients.map((c) => c.id)).toEqual([
      clientA2,
    ]);
    expect((await searchAll(w.db, ownerA.ctx, '__')).clients).toEqual([]);
  });

  it('é insensível a acentos e maiúsculas', async () => {
    expect((await searchAll(w.db, ownerA.ctx, 'DOCE PAO')).clients).toHaveLength(1);
  });
});

describe('troca de organização', () => {
  it('só entre organizações das quais é membro; muda o contexto e audita', async () => {
    const multi = await w.actor(A, 'writer');
    await w.member({ orgId: B, userId: multi.userId, role: 'viewer' });
    expect((await listMyOrganizations(w.db, multi.userId)).map((o) => o.id).sort()).toEqual(
      [A, B].sort(),
    );
    const { sessionId } = await createSession(w.db, {
      userId: multi.userId,
      organizationId: A,
      ip: 'x',
      userAgent: 'x',
    });
    const ctx = { ...(await w.ctx(multi.userId, A)), sessionId };

    await switchOrganization(w.db, ctx, B);
    const [s] = await w.db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(s!.organizationId).toBe(B);
    const logs = await w.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'session.organization_switched'));
    expect(logs.some((l) => l.organizationId === B && l.actorUserId === multi.userId)).toBe(true);
    // Na B ele é só consulta: não vê equipe
    const inB = await buildContext(w.db, { userId: multi.userId, organizationId: B });
    expect(inB).not.toBeNull();
    expect(await code(listAudit(w.db, inB!))).toBe('FORBIDDEN');
  });

  it('organização alheia é indistinguível de inexistente e não altera a sessão', async () => {
    const solo = await w.actor(A, 'writer');
    const { sessionId } = await createSession(w.db, {
      userId: solo.userId,
      organizationId: A,
      ip: 'x',
      userAgent: 'x',
    });
    const ctx = { ...solo.ctx, sessionId };
    expect(await code(switchOrganization(w.db, ctx, B))).toBe('NOT_FOUND');
    expect(await code(switchOrganization(w.db, ctx, '01HZZZZZZZZZZZZZZZZZZZZZZZ'))).toBe(
      'NOT_FOUND',
    );
    const [s] = await w.db.select().from(sessions).where(eq(sessions.id, sessionId));
    expect(s!.organizationId).toBe(A);
  });
});

describe('dashboard', () => {
  it('mostra apenas dados reais: convites vencidos/expirando viram atenção; contadores batem', async () => {
    const org = await w.org('Agência Dash');
    const owner = await w.actor(org, 'owner');
    const writerRole = await systemRoleId(w.db, 'writer');
    // Datas relativas a agora: o TIMESTAMP do MySQL só vai até 2038.
    const t0 = new Date();
    const day = 86_400_000;
    await createInvitation(
      w.db,
      owner.ctx,
      { email: 'velho@example.test', name: 'Convite Velho', roleId: writerRole },
      new Date(t0.getTime() - 30 * day),
    );
    await createInvitation(
      w.db,
      owner.ctx,
      { email: 'logo@example.test', name: 'Convite Logo', roleId: writerRole },
      new Date(t0.getTime() - 6.5 * day),
    );
    await createInvitation(
      w.db,
      owner.ctx,
      { email: 'novo@example.test', name: 'Convite Novo', roleId: writerRole },
      t0,
    );

    const d = await getDashboard(w.db, owner.ctx, {}, t0);
    const byTitle = Object.fromEntries(d.pending.map((p) => [p.title, p.severity]));
    expect(byTitle['Convite vencido: Convite Velho']).toBe('alert');
    expect(byTitle['Convite expira em breve: Convite Logo']).toBe('alert');
    expect(byTitle['Convite aguardando aceite: Convite Novo']).toBe('info');
    expect(d.pending[0]!.severity).toBe('alert'); // alertas primeiro
    expect(d.counters).toMatchObject({ members: 1, pendingInvitations: 3, clients: 0 });
    expect(d.activity!.length).toBeGreaterThan(0);
  });

  it('respeita permissões: redator só vê o que pode (sem pendências de equipe, sem atividade)', async () => {
    const writer = await w.actor(A, 'writer');
    const d = await getDashboard(w.db, writer.ctx, {});
    expect(d.pending).toEqual([]);
    expect(d.activity).toBeNull();
    expect(d.counters.members).toBeNull();
    expect(d.counters.pendingInvitations).toBeNull();
    expect(d.counters.clients).toBeGreaterThan(0);
  });

  it('filtro de cliente só vale dentro do escopo; fora dele é ignorado (sem vazar)', async () => {
    const scoped = await w.actor(A, 'viewer', { clientId: clientA1 });
    const d = await getDashboard(w.db, scoped.ctx, { clientId: clientA2 });
    expect(d.filters.clientId).toBeNull();
    expect(d.clientsInScope.map((c) => c.id)).toEqual([clientA1]);
    const ownerView = await getDashboard(w.db, ownerA.ctx, { clientId: clientB1 });
    expect(ownerView.filters.clientId).toBeNull(); // cliente de outra org
  });

  it('filtro de período é normalizado e limita a atividade', async () => {
    const future = new Date(Date.now() + 100 * 86_400_000);
    const d = await getDashboard(w.db, ownerA.ctx, { days: 7 }, future);
    expect(d.activity).toEqual([]);
    expect((await getDashboard(w.db, ownerA.ctx, { days: 9999 })).filters.days).toBe(30);
  });

  it('convite revogado ou aceito deixa de ser pendência', async () => {
    const rows = await w.db
      .select()
      .from(invitations)
      .where(eq(invitations.email, 'nova1@example.test'));
    expect(rows[0]!.acceptedAt).not.toBeNull();
    const d = await getDashboard(w.db, ownerA.ctx, {});
    expect(d.pending.some((p) => p.detail.includes('nova1@example.test'))).toBe(false);
  });
});
