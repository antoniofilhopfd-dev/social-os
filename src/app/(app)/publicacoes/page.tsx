import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { PUBLICATION_STATUS_LABELS } from '@/modules/publications/rules';
import { listPublications } from '@/modules/publications/service';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';

export const metadata: Metadata = { title: 'Publicações' };
const fmt = (d: string) => d.split('-').reverse().join('/');

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; clientId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (
    ctx.userKind !== 'internal' ||
    !ctx.grants.some((g) => g.permissions.has('publications:view'))
  )
    return <Forbidden />;
  const history = sp.view === 'historico';
  const clientId = sp.clientId && isId(sp.clientId) ? sp.clientId : undefined;
  const db = getDb();
  const [clients, queue, done] = await Promise.all([
    listClients(db, ctx),
    history
      ? Promise.resolve({ items: [] })
      : listPublications(db, ctx, { status: 'scheduled', clientId, limit: 200 }),
    history
      ? Promise.all(
          (['published', 'failed', 'cancelled'] as const).map((s) =>
            listPublications(db, ctx, { status: s, clientId, limit: 100 }),
          ),
        ).then((r) => ({
          items: r
            .flatMap((x) => x.items)
            .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1)),
        }))
      : Promise.resolve({ items: [] }),
  ]);
  const groups = history
    ? [{ key: 'hist', title: 'Histórico', items: done.items }]
    : [
        {
          key: 'overdue',
          title: 'Atrasadas',
          items: queue.items.filter((i) => i.queue === 'overdue'),
        },
        { key: 'today', title: 'Hoje', items: queue.items.filter((i) => i.queue === 'today') },
        {
          key: 'upcoming',
          title: 'Próximas',
          items: queue.items.filter((i) => i.queue === 'upcoming'),
        },
      ];
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return (
    <>
      <div className="page-head">
        <h1>Publicações</h1>
        <div className="row">
          <Link
            href="/publicacoes"
            className={`btn btn-sm ${history ? 'btn-secondary' : 'btn-primary'}`}
            aria-current={history ? undefined : 'page'}
          >
            Fila
          </Link>
          <Link
            href="/publicacoes?view=historico"
            className={`btn btn-sm ${history ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={history ? 'page' : undefined}
          >
            Histórico
          </Link>
        </div>
      </div>
      <p className="muted">
        A publicação é assistida: a equipe copia o pacote, publica na rede e registra aqui. Nenhuma
        publicação é feita automaticamente.
      </p>
      <form method="get" className="section form-row" aria-label="Filtros de publicações">
        {history && <input type="hidden" name="view" value="historico" />}
        <div className="field">
          <label htmlFor="pu-cliente">Cliente</label>
          <select id="pu-cliente" name="clientId" className="input" defaultValue={clientId ?? ''}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
      </form>
      {total === 0 ? (
        <EmptyState
          title={history ? 'Nenhuma publicação registrada' : 'Nenhuma publicação programada'}
          description={
            history
              ? undefined
              : 'Programe conteúdos aprovados pela aba “Publicação” de cada conteúdo.'
          }
        />
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.key} aria-labelledby={`pu-${g.key}`} style={{ marginBottom: 16 }}>
              <h2 id={`pu-${g.key}`}>
                {g.title}{' '}
                <Badge tone={g.key === 'overdue' ? 'danger' : 'neutral'}>{g.items.length}</Badge>
              </h2>
              <div className="table-wrap">
                <table className="table">
                  <caption className="sr-only">{g.title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Quando</th>
                      <th scope="col">Conteúdo</th>
                      <th scope="col">Cliente / perfil</th>
                      <th scope="col">Situação</th>
                      <th scope="col">Responsável</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {fmt(p.scheduledDate)}
                          {p.scheduledTime ? ` ${p.scheduledTime}` : ''}
                        </td>
                        <td>
                          <Link href={`/publicacoes/${p.id}`}>
                            #{p.contentNumber} · {p.title}
                          </Link>
                        </td>
                        <td>
                          {p.clientName} · {NETWORK_LABELS[p.network]} @{p.handle}
                        </td>
                        <td>
                          <Badge
                            tone={
                              p.status === 'published'
                                ? 'success'
                                : p.status === 'failed'
                                  ? 'danger'
                                  : p.queue === 'overdue'
                                    ? 'danger'
                                    : 'info'
                            }
                          >
                            {PUBLICATION_STATUS_LABELS[p.status]}
                            {p.queue === 'overdue' ? ' · atrasada' : ''}
                          </Badge>
                        </td>
                        <td>{p.assigneeName ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
      )}
    </>
  );
}
