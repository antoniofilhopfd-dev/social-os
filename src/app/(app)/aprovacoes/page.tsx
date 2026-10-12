import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { APPROVAL_STATUS_LABELS, type ApprovalStatus } from '@/modules/approvals/rules';
import { listApprovals } from '@/modules/approvals/service';
import { FORMAT_LABELS } from '@/modules/contents/rules';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';

export const metadata: Metadata = { title: 'Aprovações' };
const fmt = (d: Date | null) => (d ? d.toLocaleDateString('pt-BR') : '—');
const tone = (s: ApprovalStatus) =>
  s === 'approved'
    ? 'success'
    : s === 'changes_requested'
      ? 'danger'
      : s === 'pending'
        ? 'warning'
        : 'neutral';

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; clientId?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('approvals:view'))) return <Forbidden />;
  const db = getDb();
  const external = ctx.userKind !== 'internal';
  const status = sp.status && sp.status in APPROVAL_STATUS_LABELS ? sp.status : undefined;
  const clientId = sp.clientId && isId(sp.clientId) ? sp.clientId : undefined;
  const [data, clients] = await Promise.all([
    listApprovals(db, ctx, {
      status: status ?? (external ? undefined : undefined),
      clientId,
      limit: 100,
    }),
    listClients(db, ctx),
  ]);
  const pending = data.items.filter((i) => i.status === 'pending');
  const rest = data.items.filter((i) => i.status !== 'pending');
  const table = (items: typeof data.items, caption: string) => (
    <div className="table-wrap" tabIndex={0}>
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Conteúdo</th>
            <th scope="col">Cliente</th>
            <th scope="col">Rodada</th>
            <th scope="col">Situação</th>
            <th scope="col">Enviado em</th>
            <th scope="col">Decidido em</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <Link href={`/aprovacoes/${i.id}`}>
                  #{i.contentNumber} · {i.title}
                </Link>
                <div className="muted">{FORMAT_LABELS[i.format]}</div>
              </td>
              <td>{i.clientName}</td>
              <td>{i.round}</td>
              <td>
                <Badge tone={tone(i.status)}>{APPROVAL_STATUS_LABELS[i.status]}</Badge>
              </td>
              <td>{fmt(i.requestedAt)}</td>
              <td>{fmt(i.decidedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <div className="page-head">
        <h1>Aprovações</h1>
      </div>
      <form method="get" className="section form-row" aria-label="Filtros de aprovações">
        {clients.length > 1 && (
          <div className="field">
            <label htmlFor="a-cliente">Cliente</label>
            <select id="a-cliente" name="clientId" className="input" defaultValue={clientId ?? ''}>
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="a-status">Situação</label>
          <select id="a-status" name="status" className="input" defaultValue={status ?? ''}>
            <option value="">Todas</option>
            {(Object.keys(APPROVAL_STATUS_LABELS) as ApprovalStatus[])
              .filter((s) => !external || s !== 'cancelled')
              .map((s) => (
                <option key={s} value={s}>
                  {APPROVAL_STATUS_LABELS[s]}
                </option>
              ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
      </form>
      {data.items.length === 0 ? (
        <EmptyState
          title="Nenhuma aprovação encontrada"
          description={
            external
              ? 'Quando houver conteúdos para você aprovar, eles aparecem aqui.'
              : 'Envie conteúdos ao cliente pela aba “Aprovação” de cada conteúdo.'
          }
        />
      ) : (
        <>
          {pending.length > 0 && (
            <section aria-labelledby="ap-pend">
              <h2 id="ap-pend">{external ? 'Aguardando a sua decisão' : 'Aguardando o cliente'}</h2>
              {table(pending, 'Aprovações pendentes')}
            </section>
          )}
          {rest.length > 0 && (
            <section aria-labelledby="ap-hist" style={{ marginTop: 16 }}>
              <h2 id="ap-hist">Histórico</h2>
              {table(rest, 'Histórico de aprovações')}
            </section>
          )}
        </>
      )}
    </>
  );
}
