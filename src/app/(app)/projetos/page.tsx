import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { PROJECT_STATUS_LABELS, projectProgress } from '@/modules/tasks/rules';
import { listProjects } from '@/modules/tasks/service';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';

export const metadata: Metadata = { title: 'Projetos' };
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string; status?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('tasks:view')))
    return <Forbidden />;
  const db = getDb();
  const clientId = sp.clientId && isId(sp.clientId) ? sp.clientId : undefined;
  const status = sp.status && sp.status in PROJECT_STATUS_LABELS ? sp.status : undefined;
  const [clients, items] = await Promise.all([
    listClients(db, ctx),
    listProjects(db, ctx, { clientId, status, q: sp.q?.slice(0, 120) }),
  ]);
  const canCreate = ctx.grants.some((g) => g.permissions.has('tasks:create'));
  return (
    <>
      <div className="page-head">
        <h1>Projetos</h1>
        <div className="row">
          <Link href="/tarefas" className="btn btn-secondary">
            Tarefas
          </Link>
          {canCreate && (
            <Link href="/projetos/novo" className="btn btn-primary">
              Novo projeto
            </Link>
          )}
        </div>
      </div>
      <form method="get" className="section form-row" aria-label="Filtros de projetos">
        <div className="field">
          <label htmlFor="p-q">Buscar</label>
          <input id="p-q" name="q" className="input" defaultValue={sp.q ?? ''} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="p-cliente">Cliente</label>
          <select id="p-cliente" name="clientId" className="input" defaultValue={clientId ?? ''}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="p-status">Situação</label>
          <select id="p-status" name="status" className="input" defaultValue={status ?? ''}>
            <option value="">Todas</option>
            {Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum projeto encontrado"
          description="Crie um projeto para agrupar tarefas e conteúdos de uma entrega."
        />
      ) : (
        <div className="table-wrap" tabIndex={0}>
          <table className="table">
            <caption className="sr-only">Lista de projetos</caption>
            <thead>
              <tr>
                <th scope="col">Projeto</th>
                <th scope="col">Cliente</th>
                <th scope="col">Situação</th>
                <th scope="col">Prazo</th>
                <th scope="col">Progresso</th>
                <th scope="col">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const pct = projectProgress({ done: p.tasksDone, open: p.tasksOpen });
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/projetos/${p.id}`}>{p.name}</Link>
                    </td>
                    <td>{p.clientName}</td>
                    <td>
                      <Badge
                        tone={
                          p.status === 'completed'
                            ? 'success'
                            : p.status === 'active'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {PROJECT_STATUS_LABELS[p.status]}
                      </Badge>
                    </td>
                    <td>{fmt(p.dueDate)}</td>
                    <td>
                      <progress value={pct} max={100} aria-label={`Progresso de ${p.name}`} /> {pct}
                      % ({p.tasksDone}/{p.tasksDone + p.tasksOpen})
                    </td>
                    <td>{p.ownerName ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
