import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClients } from '@/modules/clients/service';
import { cleanParams } from '@/modules/requests/schema';
import { PRIORITY_LABELS } from '@/modules/requests/rules';
import { KANBAN_COLUMNS, TASK_STATUS_LABELS, type TaskStatus } from '@/modules/tasks/rules';
import { taskFiltersSchema } from '@/modules/tasks/schema';
import { listProjects, listTaskAssignees, listTasks } from '@/modules/tasks/service';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';
import { TaskMove } from './task-move';

export const metadata: Metadata = { title: 'Tarefas' };

const VIEWS = [
  ['minhas', 'Minhas tarefas'],
  ['lista', 'Todas'],
  ['kanban', 'Kanban'],
] as const;
const dm = (d: string | null) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('tasks:view')))
    return <Forbidden />;
  const parsed = taskFiltersSchema.safeParse(cleanParams(sp));
  const f = parsed.success ? parsed.data : {};
  const view = f.view ?? 'minhas';
  const db = getDb();
  const filters = {
    ...f,
    overdue: f.overdue === '1',
    assignee: view === 'minhas' ? 'me' : f.assignee,
    status: f.status ?? (view === 'lista' ? undefined : 'open'),
    limit: view === 'kanban' ? 300 : 100,
  };
  const [data, clients, projects, assignees] = await Promise.all([
    listTasks(db, ctx, view === 'kanban' ? { ...filters, status: f.status ?? undefined } : filters),
    listClients(db, ctx),
    listProjects(db, ctx),
    listTaskAssignees(db, ctx),
  ]);
  const canCreate = ctx.grants.some((g) => g.permissions.has('tasks:create'));
  const canEdit = ctx.grants.some((g) => g.permissions.has('tasks:edit'));
  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cleanParams(sp), ...extra })) if (v) p.set(k, v);
    return `/tarefas?${p.toString()}`;
  };
  void can;

  return (
    <>
      <div className="page-head">
        <h1>Tarefas</h1>
        <div className="row">
          <Link href="/projetos" className="btn btn-secondary">
            Projetos
          </Link>
          {canCreate && (
            <Link href="/tarefas/nova" className="btn btn-primary">
              Nova tarefa
            </Link>
          )}
        </div>
      </div>
      <nav className="row" aria-label="Visões" style={{ marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <Link
            key={k}
            href={keep({ view: k })}
            className={`btn btn-sm ${view === k ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={view === k ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form method="get" className="section form-row" aria-label="Filtros de tarefas">
        <input type="hidden" name="view" value={view} />
        <div className="field">
          <label htmlFor="t-q">Buscar</label>
          <input id="t-q" name="q" className="input" defaultValue={f.q ?? ''} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="t-cliente">Cliente</label>
          <select id="t-cliente" name="clientId" className="input" defaultValue={f.clientId ?? ''}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-projeto">Projeto</label>
          <select
            id="t-projeto"
            name="projectId"
            className="input"
            defaultValue={f.projectId ?? ''}
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {view !== 'minhas' && (
          <div className="field">
            <label htmlFor="t-resp">Responsável</label>
            <select id="t-resp" name="assignee" className="input" defaultValue={f.assignee ?? ''}>
              <option value="">Todos</option>
              <option value="me">Eu</option>
              <option value="none">Sem responsável</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="t-status">Situação</label>
          <select id="t-status" name="status" className="input" defaultValue={f.status ?? ''}>
            <option value="">{view === 'lista' ? 'Todas' : 'Abertas'}</option>
            {view === 'lista' && <option value="open">Abertas</option>}
            <option value="closed">Encerradas</option>
            {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <label className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="checkbox" name="overdue" value="1" defaultChecked={f.overdue === '1'} />
          Só atrasadas
        </label>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma tarefa encontrada"
          description={
            view === 'minhas'
              ? 'Você não tem tarefas abertas atribuídas a você.'
              : 'Ajuste os filtros ou crie uma nova tarefa.'
          }
        />
      ) : view === 'kanban' ? (
        <div className="kanban" role="region" aria-label="Quadro Kanban de tarefas" tabIndex={0}>
          {KANBAN_COLUMNS.map((status) => {
            const col = data.items.filter((t) => t.status === status);
            return (
              <section key={status} className="kcol" aria-labelledby={`tk-${status}`}>
                <h3 id={`tk-${status}`}>
                  <span>{TASK_STATUS_LABELS[status]}</span>
                  <Badge>{col.length}</Badge>
                </h3>
                {col.map((t) => (
                  <article key={t.id} className="kcard">
                    <Link href={`/tarefas/${t.id}`}>{t.title}</Link>
                    <span className="muted">
                      {t.clientName ?? 'Interna'}
                      {t.projectName ? ` · ${t.projectName}` : ''}
                    </span>
                    {t.dueDate && (
                      <span className={t.due === 'overdue' ? 'field-error' : 'muted'}>
                        {dm(t.dueDate)}
                        {t.due === 'overdue' ? ' · atrasada' : ''}
                      </span>
                    )}
                    {t.assigneeName && <span className="muted">{t.assigneeName}</span>}
                    {canEdit && <TaskMove id={t.id} title={t.title} status={t.status} />}
                  </article>
                ))}
                {col.length === 0 && (
                  <p className="muted" style={{ fontSize: '0.8125rem' }}>
                    Nenhuma tarefa.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Lista de tarefas</caption>
            <thead>
              <tr>
                <th scope="col">Tarefa</th>
                <th scope="col">Cliente / projeto</th>
                <th scope="col">Situação</th>
                <th scope="col">Prioridade</th>
                <th scope="col">Prazo</th>
                <th scope="col">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/tarefas/${t.id}`}>{t.title}</Link>
                  </td>
                  <td>
                    {t.clientName ?? 'Interna'}
                    {t.projectName ? ` · ${t.projectName}` : ''}
                  </td>
                  <td>
                    <Badge
                      tone={
                        t.status === 'done'
                          ? 'success'
                          : t.status === 'blocked'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {TASK_STATUS_LABELS[t.status]}
                    </Badge>
                  </td>
                  <td>{PRIORITY_LABELS[t.priority]}</td>
                  <td>
                    {t.dueDate ? dm(t.dueDate) : '—'}
                    {t.due === 'overdue' && <Badge tone="danger">Atrasada</Badge>}
                    {t.due === 'today' && <Badge tone="warning">Hoje</Badge>}
                  </td>
                  <td>{t.assigneeName ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.nextBefore && (
        <p>
          <Link
            href={keep({ depois: undefined, before: data.nextBefore })}
            className="btn btn-secondary"
          >
            Carregar mais
          </Link>
        </p>
      )}
    </>
  );
}
