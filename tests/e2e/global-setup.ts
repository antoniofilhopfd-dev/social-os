import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { memberships, notifications, users } from '@/db/schema';
import { resetDatabase, world } from '../helpers/db';
import { PASSWORD } from './constants';
import { systemRoleId } from '@/core/permissions/seed';
import { createClient } from '@/modules/clients/service';
import { createRole } from '@/modules/roles/service';
import { createInvitation } from '@/modules/team/service';
import { notify } from '@/modules/notifications/service';
import { createBrand, createContact, createDate, createProfile } from '@/modules/clients/children';
import { createRequest, listRequestTypes } from '@/modules/requests/service';

export default async function globalSetup() {
  await resetDatabase();
  const w = world();
  try {
    const A = await w.org('Agência A');
    const B = await w.org('Agência B');
    const make = async (
      orgId: string,
      role: string,
      email: string,
      opts?: { clientId?: string },
    ) => {
      const external = role === 'client' || role === 'external_approver';
      const userId = await w.user({
        email,
        name: email.split('@')[0]!.replace(/\./g, ' '),
        password: PASSWORD,
        kind: external ? 'external' : 'internal',
      });
      await w.member({ orgId, userId, role, clientId: opts?.clientId });
      return { userId, ctx: await w.ctx(userId, orgId) };
    };
    const ownerA = await make(A, 'owner', 'dona.a@example.test');
    const ownerB = await make(B, 'owner', 'dono.b@example.test');
    const writerA = await make(A, 'writer', 'redator.a@example.test');
    const clientA1 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A1' })).id;
    const clientA2 = (await createClient(w.db, ownerA.ctx, { name: 'Cliente A2' })).id;
    const clientB1 = (await createClient(w.db, ownerB.ctx, { name: 'Cliente B1' })).id;
    await make(A, 'viewer', 'consulta.a1@example.test', { clientId: clientA1 });
    await make(A, 'client', 'cliente.a1@example.test', { clientId: clientA1 });
    // Pessoa que pertence às duas organizações (redator na A, proprietária na B): testa a troca de organização.
    const multi = await make(A, 'writer', 'multi.org@example.test');
    await w.member({ orgId: B, userId: multi.userId, role: 'owner' });
    await notify(w.db, {
      organizationId: A,
      userId: ownerA.userId,
      type: 'role_changed',
      title: 'Notificação inicial da dona A',
    });
    const [notifA] = await w.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, ownerA.userId));
    // Estágio 4: marca, perfil, contato, data e solicitações (uma por cliente, inclusive de um externo)
    const brandA = (await createBrand(w.db, ownerA.ctx, clientA1, { name: 'Marca Fixture A1' })).id;
    const profileA = (
      await createProfile(w.db, ownerA.ctx, brandA, {
        network: 'instagram',
        profileName: 'Perfil Fixture',
        handle: 'fixture_a1',
      })
    ).id;
    const contactA = (await createContact(w.db, ownerA.ctx, clientA1, { name: 'Contato Fixture' }))
      .id;
    const dateA = (
      await createDate(w.db, ownerA.ctx, clientA1, {
        label: 'Data Fixture',
        eventDate: '2031-05-01',
      })
    ).id;
    const typesA = await listRequestTypes(w.db, ownerA.ctx);
    const typeA = typesA.find((t) => t.name === 'Outro')!.id;
    const reqBase = { typeId: typeA, description: 'Descrição da solicitação de fixture' };
    const requestA1 = (
      await createRequest(w.db, ownerA.ctx, {
        ...reqBase,
        clientId: clientA1,
        title: 'Fixture solicitação do A1',
      })
    ).id;
    const requestA2 = (
      await createRequest(w.db, ownerA.ctx, {
        ...reqBase,
        clientId: clientA2,
        title: 'Fixture solicitação do A2',
      })
    ).id;
    const extA1 = await w.db.select().from(users).where(eq(users.email, 'cliente.a1@example.test'));
    const extCtx = await w.ctx(extA1[0]!.id, A);
    const requestExtA1 = (
      await createRequest(w.db, extCtx, {
        ...reqBase,
        clientId: clientA1,
        title: 'Fixture pedido do cliente externo',
      })
    ).id;
    const typeB = (await listRequestTypes(w.db, ownerB.ctx))[0]!.id;
    const requestB1 = (
      await createRequest(w.db, ownerB.ctx, {
        typeId: typeB,
        description: 'Descrição fixture B',
        clientId: clientB1,
        title: 'Fixture solicitação da B',
        network: 'instagram',
        format: 'Post',
        objective: 'x',
        desiredDate: '2031-01-01',
      })
    ).id;
    const roleA = (
      await createRole(w.db, ownerA.ctx, {
        name: 'Função Personalizada A',
        kind: 'internal',
        permissions: ['clients:view'],
      })
    ).id;
    const inv = await createInvitation(w.db, ownerA.ctx, {
      email: 'pendente.a@example.test',
      name: 'Pendente A',
      roleId: await systemRoleId(w.db, 'writer'),
    });
    const [memWriterA] = await w.db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, writerA.userId));

    writeFileSync(
      path.resolve(__dirname, '.fixtures.json'),
      JSON.stringify({
        A,
        B,
        clientA1,
        clientA2,
        clientB1,
        roleA,
        invitationA: inv.id,
        membershipWriterA: memWriterA!.id,
        writerAUserId: writerA.userId,
        ownerAUserId: ownerA.userId,
        notificationA: notifA!.id,
        brandA,
        profileA,
        contactA,
        dateA,
        typeA,
        requestA1,
        requestA2,
        requestExtA1,
        requestB1,
      }),
    );
  } finally {
    await w.close();
  }
}
