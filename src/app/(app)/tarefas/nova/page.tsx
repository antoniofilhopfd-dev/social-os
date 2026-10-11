import type { Metadata } from 'next';
import { getDb } from '@/db';
import { canOrgWide, can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { listProjects, listTaskAssignees } from '@/modules/tasks/service';
import { Forbidden } from '@/ui/forbidden';
import { TaskForm } from '../task-form';

export const metadata: Metadata = { title: 'Nova tarefa' };

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteId?: string; projetoId?: string; conteudoId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx, user } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('tasks:create')))
    return <Forbidden />;
  const db = getDb();
  const clients = (await listClients(db, ctx)).filter((c) => can(ctx, 'tasks:create', c.id));
  const [projects, assignees] = await Promise.all([
    listProjects(db, ctx),
    listTaskAssignees(db, ctx),
  ]);
  return (
    <>
      <div className="page-head">
        <h1>Nova tarefa</h1>
      </div>
      <TaskForm
        mode="create"
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
        assignees={assignees}
        canAssign={
          canOrgWide(ctx, 'tasks:assign') ||
          ctx.grants.some((g) => g.permissions.has('tasks:assign'))
        }
        meId={user.id}
        canOrgWide={canOrgWide(ctx, 'tasks:create')}
        prefill={{
          clientId: sp.clienteId && isId(sp.clienteId) ? sp.clienteId : undefined,
          projectId: sp.projetoId && isId(sp.projetoId) ? sp.projetoId : undefined,
          contentId: sp.conteudoId && isId(sp.conteudoId) ? sp.conteudoId : undefined,
        }}
      />
    </>
  );
}
