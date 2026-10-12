import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { todayLocal } from '@/core/time';
import { listClients } from '@/modules/clients/service';
import { FORMAT_LABELS } from '@/modules/contents/rules';
import { METRIC_LABELS } from '@/modules/metrics/rules';
import { isValidDate } from '@/modules/contents/rules';
import { operationsReport, performanceReport } from '@/modules/metrics/service';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';

export const metadata: Metadata = { title: 'Resultados' };
const fmtD = (d: string) => d.split('-').reverse().join('/');
const n = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('pt-BR')}%`);

function addDays(date: string, d: number) {
  const x = new Date(`${date}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    clientId?: string;
    aba?: string;
    imprimir?: string;
  }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('metrics:view'))) return <Forbidden />;
  const internal = ctx.userKind === 'internal';
  const db = getDb();
  const today = todayLocal();
  const to = sp.to && isValidDate(sp.to) ? sp.to : today;
  const from = sp.from && isValidDate(sp.from) ? sp.from : addDays(to, -29);
  const clientId = sp.clientId && isId(sp.clientId) ? sp.clientId : undefined;
  const tab = internal && sp.aba === 'operacao' ? 'operacao' : 'desempenho';
  const clients = await listClients(db, ctx);
  const filters = { from, to, clientId };
  const canExport = internal && ctx.grants.some((g) => g.permissions.has('metrics:export'));
  const canCreate = internal && ctx.grants.some((g) => g.permissions.has('metrics:create'));
  let error: string | null = null;
  let perf: Awaited<ReturnType<typeof performanceReport>> | null = null;
  let ops: Awaited<ReturnType<typeof operationsReport>> | null = null;
  try {
    if (tab === 'desempenho') perf = await performanceReport(db, ctx, filters);
    else ops = await operationsReport(db, ctx, filters);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Não foi possível gerar o relatório.';
  }
  const q = new URLSearchParams({ from, to });
  if (clientId) q.set('clientId', clientId);
  const printing = sp.imprimir === '1';
  const clientName = clientId ? clients.find((c) => c.id === clientId)?.name : undefined;

  return (
    <div className={printing ? 'print-report' : undefined}>
      <div className="page-head">
        <h1>Resultados</h1>
        {!printing && (
          <div className="row">
            {canCreate && (
              <Link href="/resultados/seguidores" className="btn btn-secondary">
                Seguidores
              </Link>
            )}
            {canExport && tab === 'desempenho' && (
              <a className="btn btn-secondary" href={`/api/metrics/export?${q.toString()}`}>
                Exportar CSV
              </a>
            )}
            <Link
              href={`/resultados?${q.toString()}&aba=${tab}&imprimir=1`}
              className="btn btn-secondary"
            >
              Versão para impressão
            </Link>
          </div>
        )}
      </div>
      {printing && (
        <p>
          Período: {fmtD(from)} a {fmtD(to)}
          {clientName ? ` · Cliente: ${clientName}` : ''}
          {' · '}
          <span className="no-print">
            <Link href={`/resultados?${q.toString()}&aba=${tab}`}>Voltar</Link>
          </span>
        </p>
      )}
      {!printing && (
        <>
          {internal && (
            <nav className="row" aria-label="Relatórios" style={{ marginBottom: 12 }}>
              <Link
                href={`/resultados?${q.toString()}`}
                className={`btn btn-sm ${tab === 'desempenho' ? 'btn-primary' : 'btn-secondary'}`}
                aria-current={tab === 'desempenho' ? 'page' : undefined}
              >
                Desempenho
              </Link>
              <Link
                href={`/resultados?${q.toString()}&aba=operacao`}
                className={`btn btn-sm ${tab === 'operacao' ? 'btn-primary' : 'btn-secondary'}`}
                aria-current={tab === 'operacao' ? 'page' : undefined}
              >
                Operação
              </Link>
            </nav>
          )}
          <form method="get" className="section form-row" aria-label="Filtros do relatório">
            {tab === 'operacao' && <input type="hidden" name="aba" value="operacao" />}
            <div className="field">
              <label htmlFor="r-from">De</label>
              <input id="r-from" name="from" type="date" className="input" defaultValue={from} />
            </div>
            <div className="field">
              <label htmlFor="r-to">Até</label>
              <input id="r-to" name="to" type="date" className="input" defaultValue={to} />
            </div>
            {clients.length > 1 && (
              <div className="field">
                <label htmlFor="r-cliente">Cliente</label>
                <select
                  id="r-cliente"
                  name="clientId"
                  className="input"
                  defaultValue={clientId ?? ''}
                >
                  <option value="">Todos</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn btn-primary" type="submit">
              Gerar
            </button>
          </form>
        </>
      )}
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {perf &&
        (perf.totals.posts === 0 ? (
          <EmptyState
            title="Nenhuma publicação no período"
            description="Publicações registradas como publicadas aparecem aqui, com os resultados informados."
          />
        ) : (
          <>
            <section aria-labelledby="r-resumo">
              <h2 id="r-resumo">Resumo</h2>
              <div className="grid kpis">
                {[
                  ['Publicações', n(perf.totals.posts)],
                  ['Com resultados', `${perf.totals.postsWithMetrics} de ${perf.totals.posts}`],
                  [METRIC_LABELS.reach, n(perf.totals.reach)],
                  [METRIC_LABELS.impressions, n(perf.totals.impressions)],
                  [METRIC_LABELS.interactions, n(perf.totals.interactions)],
                  [METRIC_LABELS.engagementRate, pct(perf.totals.engagementRate)],
                ].map(([label, value]) => (
                  <div key={label} className="stat">
                    <strong>{value}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <p className="muted">
                Totais somam apenas o que foi informado (campo vazio não conta como zero). Taxa de
                engajamento = interações ÷ alcance, nas publicações que informaram ambos. Interações
                = curtidas + comentários + compartilhamentos + salvamentos.
              </p>
              {perf.totals.postsWithMetrics < perf.totals.posts && (
                <p>
                  <Badge tone="warning">Atenção</Badge>{' '}
                  {perf.totals.posts - perf.totals.postsWithMetrics} publicação(ões) ainda sem
                  resultados registrados.
                </p>
              )}
            </section>

            {perf.top.length > 0 && (
              <section aria-labelledby="r-top" className="section stack">
                <h2 id="r-top">Publicações com mais interações</h2>
                <ol>
                  {perf.top.map((p) => (
                    <li key={p.publicationId}>
                      #{p.number} {p.title} — {n(p.interactions)} interações
                      {p.engagementRate != null ? ` (${pct(p.engagementRate)})` : ''} ·{' '}
                      {NETWORK_LABELS[p.network]}
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section aria-labelledby="r-grupos" className="section stack">
              <h2 id="r-grupos">Por rede e por formato</h2>
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <caption className="sr-only">Resultados por rede e formato</caption>
                  <thead>
                    <tr>
                      <th scope="col">Grupo</th>
                      <th scope="col">Publicações</th>
                      <th scope="col">Com resultados</th>
                      <th scope="col">Alcance</th>
                      <th scope="col">Interações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.byNetwork.map((g) => (
                      <tr key={`n-${g.key}`}>
                        <th scope="row">
                          Rede: {NETWORK_LABELS[g.key as keyof typeof NETWORK_LABELS] ?? g.key}
                        </th>
                        <td>{g.posts}</td>
                        <td>{g.postsWithMetrics}</td>
                        <td>{n(g.reach)}</td>
                        <td>{n(g.interactions)}</td>
                      </tr>
                    ))}
                    {perf.byFormat.map((g) => (
                      <tr key={`f-${g.key}`}>
                        <th scope="row">
                          Formato: {FORMAT_LABELS[g.key as keyof typeof FORMAT_LABELS] ?? g.key}
                        </th>
                        <td>{g.posts}</td>
                        <td>{g.postsWithMetrics}</td>
                        <td>{n(g.reach)}</td>
                        <td>{n(g.interactions)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {perf.followers.length > 0 && (
              <section aria-labelledby="r-seg" className="section stack">
                <h2 id="r-seg">Seguidores</h2>
                <ul className="plain-list">
                  {perf.followers.map((s) => (
                    <li key={s.profileId}>
                      {s.clientName} · {NETWORK_LABELS[s.network]} @{s.handle}: {n(s.start)} (
                      {fmtD(s.from)}) → {n(s.end)} ({fmtD(s.to)})
                      {s.growth == null
                        ? ' · só um registro no período'
                        : ` · ${s.growth >= 0 ? '+' : ''}${s.growth.toLocaleString('pt-BR')}`}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="r-posts" className="section stack">
              <h2 id="r-posts">Todas as publicações do período</h2>
              <div className="table-wrap" tabIndex={0}>
                <table className="table">
                  <caption className="sr-only">Publicações do período</caption>
                  <thead>
                    <tr>
                      <th scope="col">Publicação</th>
                      <th scope="col">Publicada em</th>
                      <th scope="col">Alcance</th>
                      <th scope="col">Interações</th>
                      <th scope="col">Engajamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf.posts.map((p) => (
                      <tr key={p.publicationId}>
                        <td>
                          {internal ? (
                            <Link href={`/publicacoes/${p.publicationId}`}>
                              #{p.number} · {p.title}
                            </Link>
                          ) : (
                            <>
                              #{p.number} · {p.title}
                            </>
                          )}
                          <div className="muted">
                            {p.clientName} · {NETWORK_LABELS[p.network]} @{p.handle}
                          </div>
                        </td>
                        <td>{p.publishedAt ? p.publishedAt.toLocaleDateString('pt-BR') : '—'}</td>
                        <td>{n(p.metrics?.reach)}</td>
                        <td>{n(p.interactions)}</td>
                        <td>{p.metrics ? pct(p.engagementRate) : 'Sem resultados'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {perf.truncated && (
                <p className="muted">Lista limitada às primeiras publicações; reduza o período.</p>
              )}
            </section>
          </>
        ))}

      {ops && (
        <>
          <section aria-labelledby="o-prod" className="section stack">
            <h2 id="o-prod">Produção</h2>
            <p>
              Conteúdos criados no período: <strong>{ops.contents.created}</strong>
            </p>
            <p className="muted">
              Por situação atual:{' '}
              {Object.entries(ops.contents.byStatus)
                .map(([s, c]) => `${s}: ${c}`)
                .join(' · ') || '—'}
            </p>
          </section>
          <section aria-labelledby="o-apr" className="section stack">
            <h2 id="o-apr">Aprovações do cliente</h2>
            <p>
              Enviadas: <strong>{ops.approvals.sent}</strong> · Aprovadas:{' '}
              <strong>{ops.approvals.approved}</strong> · Com ajustes:{' '}
              <strong>{ops.approvals.changesRequested}</strong> · Pendentes:{' '}
              <strong>{ops.approvals.pending}</strong>
            </p>
            <p className="muted">
              Tempo médio de resposta:{' '}
              {ops.approvals.avgResponseHours == null
                ? '—'
                : `${ops.approvals.avgResponseHours.toLocaleString('pt-BR')} h`}
            </p>
          </section>
          <section aria-labelledby="o-pub" className="section stack">
            <h2 id="o-pub">Publicações (programadas no período)</h2>
            <p>
              Total: <strong>{ops.publications.total}</strong> · Publicadas:{' '}
              <strong>{ops.publications.published}</strong> · Programadas:{' '}
              <strong>{ops.publications.scheduled}</strong> · Atrasadas:{' '}
              <strong>{ops.publications.overdue}</strong> · Falhas:{' '}
              <strong>{ops.publications.failed}</strong>
            </p>
            <p className="muted">
              Pontualidade:{' '}
              {ops.publications.onTimeRate == null
                ? '—'
                : `${ops.publications.onTimeRate}% publicadas até a data programada`}
            </p>
          </section>
          <section aria-labelledby="o-tar" className="section stack">
            <h2 id="o-tar">Tarefas</h2>
            <p>
              Criadas: <strong>{ops.tasks.created}</strong> · Concluídas:{' '}
              <strong>{ops.tasks.completed}</strong> · Abertas e atrasadas hoje:{' '}
              <strong>{ops.tasks.overdueOpen}</strong>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
