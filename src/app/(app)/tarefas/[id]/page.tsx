import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { PRIORITY_LABELS } from '@/modules/requests/rules';
import { TASK_STATUS_LABELS } from '@/modules/tasks/rules';
import { getTask, listProjects, listTaskAssignees } from '@/modules/tasks/service';
import { Alert, Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { TaskForm } from '../task-form';
import { TaskMove } from '../task-move';
import { ChecklistPanel, CommentsPanel, DeleteTask } from './task-panels';

export const metadata: Metadata = { title: 'Tarefa' };

const EVENT_LABELS: Record<string, string> = {
  created: 'Tarefa criada',
  updated: 'Tarefa editada',
  assigned: 'Responsável alterado',
  status_changed: 'Situação alterada',
  commented: 'Comentário adicionado',
};
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx, user } = await requireAuthPage();
  if (!isId(id)) notFound();
  if (ctx.userKind !== 'internal') return <Forbidden />;
  const db = getDb();
  let t;
  try {
    t = await getTask(db, ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const [projects, assignees] = t.permissions.edit
    ? await Promise.all([listProjects(db, ctx), listTaskAssignees(db, ctx)])
    : [[], []];
  const closed = t.status === 'done' || t.status === 'cancelled';
  return (
    <>
      <p>
        <Link href="/tarefas">← Voltar às tarefas</Link>
      </p>
      <div className="page-head">
        <h1>{t.title}</h1>
        <div className="row">
          <Badge
            tone={t.status === 'done' ? 'success' : t.status === 'blocked' ? 'danger' : 'info'}
          >
            {TASK_STATUS_LABELS[t.status]}
          </Badge>
          {t.due === 'overdue' && <Badge tone="danger">Atrasada</Badge>}
          {t.due === 'today' && <Badge tone="warning">Vence hoje</Badge>}
        </div>
      </div>
      {t.status === 'blocked' && t.blockedReason && (
        <Alert tone="warning">Bloqueada: {t.blockedReason}</Alert>
      )}
      <dl className="kv section">
        <dt>Cliente</dt>
        <dd>{t.clientName ?? 'Interna (sem cliente)'}</dd>
        <dt>Projeto</dt>
        <dd>
          {t.projectId ? <Link href={`/projetos/${t.projectId}`}>{t.projectName}</Link> : '—'}
        </dd>
        <dt>Conteúdo</dt>
        <dd>
          {t.contentId ? (
            <Link href={`/conteudos/${t.contentId}`}>{t.contentLabel ?? 'Conteúdo'}</Link>
          ) : (
            '—'
          )}
        </dd>
        <dt>Responsável</dt>
        <dd>{t.assigneeName ?? '—'}</dd>
        <dt>Prioridade / prazo</dt>
        <dd>
          {PRIORITY_LABELS[t.priority]} · {fmt(t.dueDate)}
        </dd>
      </dl>
      {t.permissions.edit && (
        <section className="section stack" aria-labelledby="tk-situacao">
          <h2 id="tk-situacao">Situação</h2>
          <TaskMove id={t.id} title={t.title} status={t.status} />
        </section>
      )}
      {t.permissions.edit && !closed ? (
        <TaskForm
          mode="edit"
          clients={[]}
          projects={projects
            .filter((p) => p.clientId === t.clientId)
            .map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }))}
          assignees={assignees}
          canAssign={t.permissions.assign}
          meId={user.id}
          canOrgWide={false}
          initial={{
            id: t.id,
            title: t.title,
            description: t.description,
            priority: t.priority,
            dueDate: t.dueDate,
            assigneeUserId: t.assigneeUserId,
            projectId: t.projectId,
          }}
        />
      ) : (
        t.description && (
          <section className="section">
            <h2>Descrição</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p>
          </section>
        )
      )}
      <ChecklistPanel taskId={t.id} items={t.checklist} canEdit={t.permissions.edit && !closed} />
      <CommentsPanel
        taskId={t.id}
        comments={t.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
      <section className="section stack" aria-labelledby="tk-hist">
        <h2 id="tk-hist">Histórico</h2>
        <ul className="plain-list">
          {t.events.map((e) => (
            <li key={e.id}>
              {EVENT_LABELS[e.kind] ?? e.kind}
              {e.kind === 'status_changed' && e.metadata
                ? `: ${TASK_STATUS_LABELS[(e.metadata as { from: keyof typeof TASK_STATUS_LABELS }).from]} → ${TASK_STATUS_LABELS[(e.metadata as { to: keyof typeof TASK_STATUS_LABELS }).to]}`
                : ''}{' '}
              <span className="muted">
                · {e.actorName ?? 'Sistema'} · {e.createdAt.toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      </section>
      {t.permissions.delete && <DeleteTask taskId={t.id} />}
    </>
  );
}
