import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, invitations, memberships, roles } from '@/db/schema';
import { systemRoleId } from '@/core/permissions/seed';
import { listAudit } from '@/modules/audit/service';
import {
  createClient,
  deleteClient,
  getClient,
  listClients,
  renameClient,
} from '@/modules/clients/service';
import { createRole, deleteRole, listRoles, updateRole } from '@/modules/roles/service';
import {
  changeMemberRole,
  createInvitation,
  createResetLinkForMember,
  listTeam,
  removeMember,
  revokeInvitation,
} from '@/modules/team/service';
import { memberOf, resetDatabase, world, type World } from '../helpers/db';

let w: World;
let A: string, B: string;
let ownerA: Awaited<ReturnType<World['actor']>>, ownerB: Awaited<ReturnType<World['actor']>>;
let writerA: Awaited<ReturnType<World['actor']>>;
let clientA1: string, clientA2: string, clientB1: string;
let customRoleA: string;
let invitationA: string;

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
  writerA = await w.actor(A, 'writer');
  clientA1 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A1' })).id;
  clientA2 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A2' })).id;
  clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
  customRoleA = (
    await createRole(w.db, ownerA.ctx, {
      name: 'Função A',
      kind: 'internal',
      permissions: ['clients:view'],
    })
  ).id;
  invitationA = (
    await createInvitation(w.db, ownerA.ctx, {
      email: 'pendente@example.test',
      name: 'P',
      roleId: await systemRoleId(w.db, 'writer'),
    })
  ).id;
});
afterAll(async () => w.close());

describe('isolamento entre organizações (usuário da B mirando recursos da A)', () => {
  it('clientes: listagem só traz os próprios; leitura/edição/exclusão por ID da outra org dão NOT_FOUND', async () => {
    expect((await listClients(w.db, ownerB.ctx)).map((c) => c.name)).toEqual(['Cliente B1']);
    expect(await code(getClient(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    expect(await code(renameClient(w.db, ownerB.ctx, clientA1, { name: 'Invadido' }))).toBe(
      'NOT_FOUND',
    );
    expect(await code(deleteClient(w.db, ownerB.ctx, clientA1))).toBe('NOT_FOUND');
    const [c] = await w.db.select().from(clients).where(eq(clients.id, clientA1));
    expect(c).toMatchObject({ name: 'Cliente A1', deletedAt: null });
  });

  it('equipe: não lista, altera função, remove membro, revoga convite nem gera link de senha de outra org', async () => {
    const team = await listTeam(w.db, ownerB.ctx);
    expect(team.members.map((m) => m.userId)).toEqual([ownerB.userId]);
    expect(team.invitations).toHaveLength(0);
    const [memA] = await memberOf(w.db, A, writerA.userId);
    const viewer = await systemRoleId(w.db, 'viewer');
    expect(await code(changeMemberRole(w.db, ownerB.ctx, memA!.id, viewer))).toBe('NOT_FOUND');
    expect(await code(removeMember(w.db, ownerB.ctx, memA!.id))).toBe('NOT_FOUND');
    expect(await code(revokeInvitation(w.db, ownerB.ctx, invitationA))).toBe('NOT_FOUND');
    expect(await code(createResetLinkForMember(w.db, ownerB.ctx, writerA.userId))).toBe(
      'NOT_FOUND',
    );
    expect((await memberOf(w.db, A, writerA.userId))[0]!.roleId).toBe(memA!.roleId);
    const [inv] = await w.db.select().from(invitations).where(eq(invitations.id, invitationA));
    expect(inv!.revokedAt).toBeNull();
  });

  it('funções: não vê nem altera funções personalizadas de outra org', async () => {
    expect((await listRoles(w.db, ownerB.ctx)).some((r) => r.id === customRoleA)).toBe(false);
    expect(
      await code(
        updateRole(w.db, ownerB.ctx, customRoleA, { name: 'x', kind: 'internal', permissions: [] }),
      ),
    ).toBe('NOT_FOUND');
    expect(await code(deleteRole(w.db, ownerB.ctx, customRoleA))).toBe('NOT_FOUND');
  });

  it('não usa função personalizada nem cliente de outra org em convites', async () => {
    expect(
      await code(
        createInvitation(w.db, ownerB.ctx, {
          email: 'a@example.test',
          name: 'A',
          roleId: customRoleA,
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(
      await code(
        createInvitation(w.db, ownerB.ctx, {
          email: 'b@example.test',
          name: 'B',
          roleId: await systemRoleId(w.db, 'client'),
          clientId: clientA1,
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('auditoria: só eventos da própria organização', async () => {
    const a = await listAudit(w.db, ownerA.ctx);
    const b = await listAudit(w.db, ownerB.ctx);
    expect(a.items.length).toBeGreaterThan(0);
    expect(
      b.items.every((i) => i.metadata === null || !JSON.stringify(i.metadata).includes(clientA1)),
    ).toBe(true);
    expect(b.items.some((i) => i.entityId === clientA1)).toBe(false);
  });

  it('função personalizada de uma org não concede nada em outra (mesmo via vínculo forjado)', async () => {
    const intruder = await w.user({ email: 'intruso@example.test' });
    // vínculo na org B apontando para a função personalizada da org A (algo que a API não permite criar)
    await w.db.insert(memberships).values({
      id: 'M'.padEnd(26, '0'),
      organizationId: B,
      userId: intruder,
      roleId: customRoleA,
      scopeType: 'organization',
      scopeKey: '*',
    });
    const { buildContext } = await import('@/core/auth/context');
    expect(await buildContext(w.db, { userId: intruder, organizationId: B })).toBeNull();
    await w.db.delete(memberships).where(eq(memberships.userId, intruder));
  });

  it('funções do sistema não podem ser alteradas por nenhuma organização', async () => {
    const [sys] = await w.db.select().from(roles).where(eq(roles.keyName, 'owner'));
    expect(
      await code(
        updateRole(w.db, ownerA.ctx, sys!.id, { name: 'x', kind: 'internal', permissions: [] }),
      ),
    ).toBe('NOT_FOUND');
    expect(await code(deleteRole(w.db, ownerA.ctx, sys!.id))).toBe('NOT_FOUND');
  });
});

describe('escopo por cliente (mesma organização)', () => {
  it('quem tem escopo no cliente A1 enxerga apenas A1', async () => {
    const scoped = await w.actor(A, 'viewer', { clientId: clientA1 });
    expect((await listClients(w.db, scoped.ctx)).map((c) => c.id)).toEqual([clientA1]);
    expect(await getClient(w.db, scoped.ctx, clientA1)).toMatchObject({ name: 'Cliente A1' });
    expect(await code(getClient(w.db, scoped.ctx, clientA2))).toBe('NOT_FOUND');
    expect(await code(getClient(w.db, scoped.ctx, clientB1))).toBe('NOT_FOUND');
  });

  it('escopo de cliente não dá acesso a equipe, funções, auditoria nem criação de clientes', async () => {
    const scoped = await w.actor(A, 'viewer', { clientId: clientA1 });
    expect(await code(listTeam(w.db, scoped.ctx))).toBe('FORBIDDEN');
    expect(await code(listRoles(w.db, scoped.ctx))).toBe('FORBIDDEN');
    expect(await code(listAudit(w.db, scoped.ctx))).toBe('FORBIDDEN');
    expect(await code(createClient(w.db, scoped.ctx, { name: 'Novo' }))).toBe('FORBIDDEN');
  });

  it('editar/excluir exige a permissão no cliente específico', async () => {
    // "viewer" só lê; função personalizada com edit/delete limitada ao cliente A1
    const role = await createRole(w.db, ownerA.ctx, {
      name: 'Editor de cliente',
      kind: 'internal',
      permissions: ['clients:view', 'clients:edit'],
    });
    const userId = await w.user({ email: 'editor@example.test' });
    await w.db.insert(memberships).values({
      id: 'E'.padEnd(26, '1'),
      organizationId: A,
      userId,
      roleId: role.id,
      scopeType: 'client',
      clientId: clientA1,
      scopeKey: clientA1,
    });
    const ctx = await w.ctx(userId, A);
    expect(await code(renameClient(w.db, ctx, clientA1, { name: 'Cliente A1 (editado)' }))).toBe(
      'ok',
    );
    expect(await code(renameClient(w.db, ctx, clientA2, { name: 'Hack' }))).toBe('NOT_FOUND');
    expect(await code(deleteClient(w.db, ctx, clientA1))).toBe('FORBIDDEN');
    await renameClient(w.db, ownerA.ctx, clientA1, { name: 'Cliente A1' });
  });

  it('cliente excluído (lixeira) some das listagens e do acesso por ID', async () => {
    const temp = (await createClient(w.db, ownerA.ctx, { name: 'Temporário' })).id;
    await deleteClient(w.db, ownerA.ctx, temp);
    expect((await listClients(w.db, ownerA.ctx)).some((c) => c.id === temp)).toBe(false);
    expect(await code(getClient(w.db, ownerA.ctx, temp))).toBe('NOT_FOUND');
  });
});

describe('permissões por função', () => {
  it('redator não gerencia clientes, equipe, funções nem auditoria', async () => {
    expect(await code(createClient(w.db, writerA.ctx, { name: 'X' }))).toBe('FORBIDDEN');
    expect(await code(listTeam(w.db, writerA.ctx))).toBe('FORBIDDEN');
    expect(await code(listRoles(w.db, writerA.ctx))).toBe('FORBIDDEN');
    expect(await code(listAudit(w.db, writerA.ctx))).toBe('FORBIDDEN');
    expect(await code(listClients(w.db, writerA.ctx))).toBe('ok');
  });
});
