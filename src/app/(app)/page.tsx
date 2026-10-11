import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { AUDIT_LABELS } from '@/modules/audit/labels';
import { PERIOD_OPTIONS, getDashboard, normalizeDays } from '@/modules/dashboard/service';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';

export const metadata: Metadata = { title: 'Início' };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string; cliente?: string }>;
}) {
  const sp = await searchParams;
  const { user, ctx } = await requireAuthPage();
  const data = await getDashboard(getDb(), ctx, {
    days: normalizeDays(sp.dias),
    clientId: isId(sp.cliente) ? sp.cliente : null,
  });
  const shortcuts = [
    { href: '/equipe', label: 'Convidar pessoa', show: canOrgWide(ctx, 'team:create') },
    { href: '/clientes', label: 'Adicionar cliente', show: canOrgWide(ctx, 'clients:create') },
    { href: '/funcoes', label: 'Gerenciar funções', show: canOrgWide(ctx, 'roles:view') },
    { href: '/auditoria', label: 'Ver auditoria', show: canOrgWide(ctx, 'audit:view') },
  ].filter((s) => s.show);

  return (
    <>
      <div className="page-head">
        <h1>Olá, {user.name.split(' ')[0]}</h1>
      </div>

      <form method="get" className="section form-row" aria-label="Filtros do painel">
        <div className="field">
          <label htmlFor="f-dias">Período da atividade</label>
          <select
            id="f-dias"
            name="dias"
            className="input"
            defaultValue={String(data.filters.days)}
          >
            {PERIOD_OPTIONS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} dias
              </option>
            ))}
          </select>
        </div>
        {data.clientsInScope.length > 0 && (
          <div className="field">
            <label htmlFor="f-cliente">Cliente</label>
            <select
              id="f-cliente"
              name="cliente"
              className="input"
              defaultValue={data.filters.clientId ?? ''}
            >
              <option value="">Todos</option>
              {data.clientsInScope.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <button type="submit" className="btn btn-secondary">
            Aplicar filtros
          </button>
        </div>
      </form>

      <section aria-labelledby="resumo" className="stack" style={{ marginBottom: 16 }}>
        <h2 id="resumo" className="sr-only">
          Resumo
        </h2>
        <div className="grid">
          <div className="stat">
            <strong>{data.counters.clients}</strong>Clientes
          </div>
          {data.counters.members !== null && (
            <div className="stat">
              <strong>{data.counters.members}</strong>Vínculos na equipe
            </div>
          )}
          {data.counters.pendingInvitations !== null && (
            <div className="stat">
              <strong>{data.counters.pendingInvitations}</strong>Convites pendentes
            </div>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="atencao">
        <h2 id="atencao">Precisa de atenção</h2>
        {data.pending.length === 0 ? (
          <EmptyState
            title="Nada pendente por aqui"
            description="Quando houver convites vencidos ou outras pendências, elas aparecem nesta lista."
          />
        ) : (
          <ul className="pending">
            {data.pending.map((p) => (
              <li key={p.id} className={p.severity}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{p.title}</strong>
                  <Badge tone={p.severity === 'alert' ? 'warning' : 'info'}>
                    {p.severity === 'alert' ? 'Atenção' : 'Informativo'}
                  </Badge>
                </div>
                <div className="muted">{p.detail}</div>
                <Link href={p.href}>Abrir</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.activity && (
        <section className="section" aria-labelledby="atividade">
          <h2 id="atividade">Atividade recente (últimos {data.filters.days} dias)</h2>
          {data.activity.length === 0 ? (
            <EmptyState title="Sem atividade no período" />
          ) : (
            <div className="table-wrap" role="region" aria-label="Atividade recente" tabIndex={0}>
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Quando</th>
                    <th scope="col">Quem</th>
                    <th scope="col">Evento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.activity.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.createdAt.toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td>{a.actorName ?? 'Sistema'}</td>
                      <td>{AUDIT_LABELS[a.action] ?? a.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {shortcuts.length > 0 && (
        <section className="section" aria-labelledby="atalhos">
          <h2 id="atalhos">Atalhos</h2>
          <div className="row">
            {shortcuts.map((s) => (
              <Link key={s.href + s.label} href={s.href} className="btn btn-secondary">
                {s.label}
              </Link>
            ))}
          </div>
        </section>
      )}

      <p className="muted">
        Conteúdos, tarefas, aprovações e publicações aparecerão aqui quando esses módulos forem
        liberados (Etapas 05 a 09). Hoje o painel mostra apenas dados que já existem.
      </p>
    </>
  );
}
