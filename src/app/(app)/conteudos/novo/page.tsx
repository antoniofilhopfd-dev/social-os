import type { Metadata } from 'next';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { listContentAssignees, listPillars } from '@/modules/contents/service';
import { isValidDate } from '@/modules/contents/rules';
import { Forbidden } from '@/ui/forbidden';
import { ContentForm } from '../content-form';

export const metadata: Metadata = { title: 'Novo conteúdo' };

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; clientId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx, user } = await requireAuthPage();
  const db = getDb();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('contents:create')))
    return <Forbidden />;
  const clients = (await listClients(db, ctx)).filter((c) => can(ctx, 'contents:create', c.id));
  const canAssign = clients.some((c) => can(ctx, 'contents:assign', c.id));
  const [pillars, assignees] = await Promise.all([
    listPillars(db, ctx),
    canAssign ? listContentAssignees(db, ctx).catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <>
      <div className="page-head">
        <h1>Novo conteúdo</h1>
      </div>
      <ContentForm
        mode="create"
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        pillars={pillars}
        assignees={assignees}
        canAssign={canAssign}
        meId={user.id}
        prefill={{
          date: sp.data && isValidDate(sp.data) ? sp.data : undefined,
          clientId: isId(sp.clientId) ? sp.clientId : undefined,
        }}
      />
    </>
  );
}
