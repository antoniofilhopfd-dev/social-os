import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS } from '@/modules/tasks/rules';
import { getProject, listTaskAssignees, listTasks } from '@/modules/tasks/service';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';
import { ProjectForm } from '../project-form';
import { DeleteProject } from './delete-project';

export const metadata: Metadata = { title: 'Projeto' };
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  if (ctx.userKind !== 'internal') return <Forbidden />;
  const db = getDb();
  let p;
  try {
    p = await getProject(db, ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [{ items }, assignees] = await Promise.all([
    listTasks(db, ctx, { projectId: id, limit: 200 }),
    p.permissions.edit ? listTaskAssignees(db, ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <p>
        <Link href="/projetos">← Voltar aos projetos</Link>
      </p>
      <div className="page-head">
        <h1>{p.name}</h1>
        <Badge tone={p.status === 'completed' ? 'success' : 'info'}>
          {PROJECT_STATUS_LABELS[p.status]}
        </Badge>
      </div>
      <dl className="kv section">
        <dt>Cliente</dt>
        <dd>
          <Link href={`/clientes/${p.clientId}`}>{p.clientName}</Link>
        </dd>
        <dt>Período</dt>
        <dd>
          {fmt(p.startDate)} a {fmt(p.dueDate)}
        </dd>
        <dt>Responsável</dt>
        <dd>{p.ownerName ?? '—'}</dd>
        {p.description && (
          <>
            <dt>Descrição</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{p.description}</dd>
          </>
        )}
      </dl>
      <section className="section stack" aria-labelledby="pj-tarefas">
        <div className="page-head" style={{ margin: 0 }}>
          <h2 id="pj-tarefas">Tarefas do projeto</h2>
          {p.permissions.create && (
            <Link
              href={`/tarefas/nova?projetoId=${p.id}&clienteId=${p.clientId}`}
              className="btn btn-secondary btn-sm"
            >
              Nova tarefa
            </Link>
          )}
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nenhuma tarefa neste projeto" />
        ) : (
          <ul className="plain-list">
            {items.map((t) => (
              <li key={t.id} className="row">
                <Link href={`/tarefas/${t.id}`}>{t.title}</Link>
                <Badge
                  tone={
                    t.status === 'done' ? 'success' : t.status === 'blocked' ? 'danger' : 'neutral'
                  }
                >
                  {TASK_STATUS_LABELS[t.status]}
                </Badge>
                <span className="muted">
                  {t.assigneeName ?? 'sem responsável'}
                  {t.dueDate ? ` · ${fmt(t.dueDate)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {p.permissions.edit && (
        <ProjectForm
          mode="edit"
          clients={[]}
          assignees={assignees}
          initial={{
            id: p.id,
            name: p.name,
            description: p.description,
            status: p.status,
            startDate: p.startDate,
            dueDate: p.dueDate,
            ownerUserId: p.ownerUserId,
          }}
        />
      )}
      {p.permissions.delete && <DeleteProject id={p.id} />}
    </>
  );
}
