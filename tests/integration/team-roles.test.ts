import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, memberships } from '@/db/schema';
import { createSession, resolveSession } from '@/core/auth/session';
import { systemRoleId } from '@/core/permissions/seed';
import {
  createRole,
  deleteRole,
  listAssignableRoles,
  listRoles,
  updateRole,
} from '@/modules/roles/service';
import { changeMemberRole, createInvitation, removeMember } from '@/modules/team/service';
import { memberOf, resetDatabase, world, type World } from '../helpers/db';

let w: World;
let org: string;
const code = (p: Promise<unknown>) =>
  p.then(
    () => 'ok',
    (e) => (e as { code: string }).code,
  );

beforeAll(async () => {
  await resetDatabase();
  w = world();
  org = await w.org('Agência Funções');
});
afterAll(async () => w.close());

describe('funções personalizadas', () => {
  it('cria, edita, e a matriz persiste; permissões inválidas são rejeitadas', async () => {
    const owner = await w.actor(org, 'owner');
    const r = await createRole(w.db, owner.ctx, {
      name: 'Revisor',
      kind: 'internal',
      permissions: ['contents:view', 'contents:approve'],
    });
    expect((await listRoles(w.db, owner.ctx)).find((x) => x.id === r.id)!.permissions).toEqual([
      'contents:approve',
      'contents:view',
    ]);
    await updateRole(w.db, owner.ctx, r.id, {
      name: 'Revisor',
      kind: 'internal',
      permissions: ['contents:view'],
    });
    expect((await listRoles(w.db, owner.ctx)).find((x) => x.id === r.id)!.permissions).toEqual([
      'contents:view',
    ]);
    expect(
      await code(
        createRole(w.db, owner.ctx, {
          name: 'Ruim',
          kind: 'internal',
          permissions: ['inexistente:acao'],
        }),
      ),
    ).toBe('VALIDATION');
    expect(
      await code(
        createRole(w.db, owner.ctx, { name: 'Revisor', kind: 'internal', permissions: [] }),
      ),
    ).toBe('CONFLICT');
  });

  it('não concede permissões que o próprio autor não possui (anti-escalada)', async () => {
    const owner = await w.actor(org, 'owner');
    // Função com gestão de funções, mas sem equipe nem auditoria
    const limited = await createRole(w.db, owner.ctx, {
      name: 'Gestor de funções',
      kind: 'internal',
      permissions: ['roles:view', 'roles:create', 'roles:edit', 'roles:delete', 'clients:view'],
    });
    const userId = await w.user({ email: 'gf@example.test' });
    await w.db.insert(memberships).values({
      id: 'G'.padEnd(26, '2'),
      organizationId: org,
      userId,
      roleId: limited.id,
      scopeType: 'organization',
      scopeKey: '*',
    });
    const ctx = await w.ctx(userId, org);
    expect(
      await code(
        createRole(w.db, ctx, { name: 'Tentativa', kind: 'internal', permissions: ['team:view'] }),
      ),
    ).toBe('FORBIDDEN');
    const ok = await createRole(w.db, ctx, {
      name: 'Dentro do limite',
      kind: 'internal',
      permissions: ['clients:view'],
    });
    expect(
      await code(
        updateRole(w.db, ctx, ok.id, {
          name: 'Dentro do limite',
          kind: 'internal',
          permissions: ['clients:view', 'audit:view'],
        }),
      ),
    ).toBe('FORBIDDEN');
    // Também não consegue editar uma função mais poderosa que a sua
    const strong = await createRole(w.db, owner.ctx, {
      name: 'Forte',
      kind: 'internal',
      permissions: ['audit:view', 'team:view'],
    });
    expect(
      await code(
        updateRole(w.db, ctx, strong.id, { name: 'Forte', kind: 'internal', permissions: [] }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('não exclui função em uso; exclui quando livre', async () => {
    const owner = await w.actor(org, 'owner');
    const r = await createRole(w.db, owner.ctx, {
      name: 'Temporária',
      kind: 'internal',
      permissions: ['clients:view'],
    });
    const inv = await createInvitation(w.db, owner.ctx, {
      email: 'uso@example.test',
      name: 'Uso',
      roleId: r.id,
    });
    expect(await code(deleteRole(w.db, owner.ctx, r.id))).toBe('CONFLICT');
    void inv;
    const free = await createRole(w.db, owner.ctx, {
      name: 'Livre',
      kind: 'internal',
      permissions: [],
    });
    expect(await code(deleteRole(w.db, owner.ctx, free.id))).toBe('ok');
  });

  it('listAssignableRoles só devolve funções cujas permissões o usuário possui', async () => {
    const manager = await w.actor(org, 'manager');
    const names = (await listAssignableRoles(w.db, manager.ctx)).map((r) => r.name);
    expect(names).toContain('Redator');
    expect(names).not.toContain('Proprietário');
    const writer = await w.actor(org, 'writer');
    expect(await code(listAssignableRoles(w.db, writer.ctx))).toBe('FORBIDDEN');
  });
});

describe('gestão de membros', () => {
  it('altera função, respeita tipo interno/externo e impede mexer em quem tem mais poder', async () => {
    const owner = await w.actor(org, 'owner');
    const manager = await w.actor(org, 'manager');
    const target = await w.actor(org, 'writer');
    const designer = await systemRoleId(w.db, 'designer');
    const [mem] = await memberOf(w.db, org, target.userId);
    expect(await code(changeMemberRole(w.db, owner.ctx, mem!.id, designer))).toBe('ok');
    expect((await memberOf(w.db, org, target.userId))[0]!.roleId).toBe(designer);
    expect(
      await code(changeMemberRole(w.db, owner.ctx, mem!.id, await systemRoleId(w.db, 'client'))),
    ).toBe('CONFLICT');
    // gestor tentando promover alguém a proprietário ou mexer no proprietário
    expect(
      await code(changeMemberRole(w.db, manager.ctx, mem!.id, await systemRoleId(w.db, 'owner'))),
    ).toBe('FORBIDDEN');
    const [ownerMem] = await memberOf(w.db, org, owner.userId);
    expect(await code(changeMemberRole(w.db, manager.ctx, ownerMem!.id, designer))).toBe(
      'FORBIDDEN',
    );
    expect(await code(removeMember(w.db, manager.ctx, ownerMem!.id))).toBe('FORBIDDEN');
  });

  it('a organização mantém ao menos um proprietário', async () => {
    const org2 = await w.org('Org Dono Único');
    const only = await w.actor(org2, 'owner');
    const [mem] = await memberOf(w.db, org2, only.userId);
    expect(await code(removeMember(w.db, only.ctx, mem!.id))).toBe('CONFLICT');
    expect(
      await code(changeMemberRole(w.db, only.ctx, mem!.id, await systemRoleId(w.db, 'manager'))),
    ).toBe('CONFLICT');
    const second = await w.actor(org2, 'owner');
    expect(await code(removeMember(w.db, only.ctx, mem!.id))).toBe('ok');
    void second;
  });

  it('remover o último vínculo na organização encerra as sessões e registra auditoria', async () => {
    const owner = await w.actor(org, 'owner');
    const target = await w.actor(org, 'viewer');
    const s = await createSession(w.db, {
      userId: target.userId,
      organizationId: org,
      ip: 'x',
      userAgent: 'x',
    });
    expect(await resolveSession(w.db, s.token)).not.toBeNull();
    const [mem] = await memberOf(w.db, org, target.userId);
    await removeMember(w.db, owner.ctx, mem!.id);
    expect(await resolveSession(w.db, s.token)).toBeNull();
    const logs = await w.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'membership.removed'));
    expect(logs.some((l) => l.entityId === mem!.id)).toBe(true);
  });
});
