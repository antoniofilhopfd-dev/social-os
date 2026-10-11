import type { Metadata } from 'next';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { listTaskAssignees } from '@/modules/tasks/service';
import { Forbidden } from '@/ui/forbidden';
import { ProjectForm } from '../project-form';

export const metadata: Metadata = { title: 'Novo projeto' };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('tasks:create')))
    return <Forbidden />;
  const db = getDb();
  const clients = (await listClients(db, ctx)).filter((c) => can(ctx, 'tasks:create', c.id));
  return (
    <>
      <div className="page-head">
        <h1>Novo projeto</h1>
      </div>
      <ProjectForm
        mode="create"
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        assignees={await listTaskAssignees(db, ctx)}
        prefillClientId={sp.clienteId && isId(sp.clienteId) ? sp.clienteId : undefined}
      />
    </>
  );
}
