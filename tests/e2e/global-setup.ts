import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { memberships } from '@/db/schema';
import { resetDatabase, world } from '../helpers/db';
import { PASSWORD } from './constants';
import { systemRoleId } from '@/core/permissions/seed';
import { createClient } from '@/modules/clients/service';
import { createRole } from '@/modules/roles/service';
import { createInvitation } from '@/modules/team/service';

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
      }),
    );
  } finally {
    await w.close();
  }
}
