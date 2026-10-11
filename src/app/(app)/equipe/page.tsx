import type { Metadata } from 'next';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db';
import { clients } from '@/db/schema';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listAssignableRoles } from '@/modules/roles/service';
import { listTeam } from '@/modules/team/service';
import { Forbidden } from '@/ui/forbidden';
import { TeamClient } from './team-client';

export const metadata: Metadata = { title: 'Equipe' };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { ctx, user } = await requireAuthPage();
  if (!canOrgWide(ctx, 'team:view')) return <Forbidden />;
  const db = getDb();
  const team = await listTeam(db, ctx, { q });
  const roles =
    canOrgWide(ctx, 'team:create') || canOrgWide(ctx, 'team:edit')
      ? await listAssignableRoles(db, ctx)
      : [];
  const orgClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.organizationId, ctx.organizationId), isNull(clients.deletedAt)))
    .orderBy(clients.name);
  return (
    <>
      <div className="page-head">
        <h1>Equipe</h1>
      </div>
      {q && (
        <p className="muted">
          Filtrando por “{q}”. <a href="/equipe">Limpar filtro</a>
        </p>
      )}
      <TeamClient
        meId={user.id}
        members={team.members.map((m) => ({
          ...m,
          lastLoginAt: m.lastLoginAt?.toISOString() ?? null,
        }))}
        invitations={team.invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        roles={roles}
        clients={orgClients}
        can={{
          invite: canOrgWide(ctx, 'team:create'),
          edit: canOrgWide(ctx, 'team:edit'),
          remove: canOrgWide(ctx, 'team:delete'),
          reset: canOrgWide(ctx, 'team:manage_users'),
          revokeInvite: canOrgWide(ctx, 'team:delete'),
        }}
      />
    </>
  );
}
