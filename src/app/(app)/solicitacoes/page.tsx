import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { canOrgWide, can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClients } from '@/modules/clients/service';
import { listRequests } from '@/modules/requests/service';
import { cleanParams, listFiltersSchema } from '@/modules/requests/schema';
import { PRIORITY_LABELS, STATUS_LABELS } from '@/modules/requests/rules';
import { Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { EmptyState } from '@/ui/states';

export const metadata: Metadata = { title: 'Solicitações' };

const SLA_BADGE = {
  response_overdue: ['Sem resposta no prazo', 'danger'],
  due_overdue: ['Prazo vencido', 'warning'],
} as const;
const STATUS_TONE = {
  new: 'info',
  in_triage: 'warning',
  awaiting_info: 'warning',
  accepted: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
} as const;

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('requests:view'))) return <Forbidden />;
  const parsed = listFiltersSchema.safeParse(cleanParams(sp));
  const f = parsed.success ? parsed.data : {};
  const db = getDb();
  const [data, clients] = await Promise.all([
    listRequests(db, ctx, { ...f, overdue: f.overdue === '1' }),
    listClients(db, ctx),
  ]);
  const staff = ctx.userKind === 'internal';
  const canCreate =
    clients.some((c) => can(ctx, 'requests:create', c.id)) || canOrgWide(ctx, 'requests:create');
  const qs = (extra: Record<string, string>) =>
    new URLSearchParams({
      ...Object.fromEntries(Object.entries(f).filter(([, v]) => v) as [string, string][]),
      ...extra,
    }).toString();

  return (
    <>
      <div className="page-head">
        <h1>Solicitações</h1>
        {canCreate && (
          <Link href="/solicitacoes/nova" className="btn btn-primary">
            Nova solicitação
          </Link>
        )}
      </div>

      <form method="get" className="section form-row" aria-label="Filtros de solicitações">
        <div className="field">
          <label htmlFor="s-q">Buscar</label>
          <input
            id="s-q"
            name="q"
            className="input"
            defaultValue={f.q ?? ''}
            placeholder="Título ou número (#12)"
          />
        </div>
        <div className="field">
          <label htmlFor="s-status">Situação</label>
          <select id="s-status" name="status" className="input" defaultValue={f.status ?? ''}>
            <option value="">Todas</option>
            <option value="open">Em aberto</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="s-prio">Prioridade</label>
          <select id="s-prio" name="priority" className="input" defaultValue={f.priority ?? ''}>
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {clients.length > 1 && (
          <div className="field">
            <label htmlFor="s-client">Cliente</label>
            <select id="s-client" name="clientId" className="input" defaultValue={f.clientId ?? ''}>
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {staff && (
          <div className="field">
            <label htmlFor="s-ass">Responsável</label>
            <select id="s-ass" name="assignee" className="input" defaultValue={f.assignee ?? ''}>
              <option value="">Todos</option>
              <option value="me">Atribuídas a mim</option>
              <option value="none">Sem responsável</option>
            </select>
          </div>
        )}
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="overdue"
            value="1"
            className="check"
            defaultChecked={f.overdue === '1'}
          />{' '}
          Somente atrasadas
        </label>
        <div>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
        </div>
      </form>

      {data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma solicitação encontrada"
          description={
            canCreate ? 'Ajuste os filtros ou crie uma nova solicitação.' : 'Ajuste os filtros.'
          }
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Lista de solicitações" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Solicitação</th>
                <th scope="col">Situação</th>
                <th scope="col" className="hide-mobile">
                  Prioridade
                </th>
                <th scope="col" className="hide-mobile">
                  Responsável
                </th>
                <th scope="col" className="hide-mobile">
                  Prazo
                </th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td>#{r.number}</td>
                  <td>
                    <Link href={`/solicitacoes/${r.id}`}>{r.title}</Link>
                    <br />
                    <span className="muted">{r.clientName}</span>
                  </td>
                  <td>
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    {r.sla !== 'ok' && (
                      <>
                        <br />
                        <Badge tone={SLA_BADGE[r.sla][1]}>{SLA_BADGE[r.sla][0]}</Badge>
                      </>
                    )}
                  </td>
                  <td className="hide-mobile">
                    {r.priority === 'urgent' || r.priority === 'high' ? (
                      <Badge tone={r.priority === 'urgent' ? 'danger' : 'warning'}>
                        {PRIORITY_LABELS[r.priority]}
                      </Badge>
                    ) : (
                      PRIORITY_LABELS[r.priority]
                    )}
                  </td>
                  <td className="hide-mobile">{r.assigneeName ?? '—'}</td>
                  <td className="hide-mobile">
                    {r.estimatedDue
                      ? r.estimatedDue.split('-').reverse().join('/')
                      : r.desiredDate
                        ? `desejada ${r.desiredDate.split('-').reverse().join('/')}`
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.nextBefore && (
        <p>
          <Link href={`/solicitacoes?${qs({ before: data.nextBefore })}`}>
            Solicitações mais antigas
          </Link>
        </p>
      )}
    </>
  );
}
