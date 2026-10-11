import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClientsAdmin } from '@/modules/clients/service';
import { Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { EmptyState } from '@/ui/states';
import { NewClientForm } from './new-client-form';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('clients:view'))) return <Forbidden />;
  const rows = await listClientsAdmin(getDb(), ctx, { q });
  return (
    <>
      <div className="page-head">
        <h1>Clientes</h1>
      </div>
      {q && (
        <p className="muted">
          Filtrando por “{q}”. <Link href="/clientes">Limpar filtro</Link>
        </p>
      )}
      {canOrgWide(ctx, 'clients:create') && <NewClientForm />}
      {rows.length === 0 ? (
        <EmptyState
          title={q ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'}
          description={
            canOrgWide(ctx, 'clients:create')
              ? 'Adicione o primeiro cliente acima.'
              : 'Nenhum cliente disponível para o seu perfil.'
          }
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Lista de clientes" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Situação</th>
                <th scope="col" className="hide-mobile">
                  Responsável
                </th>
                <th scope="col" className="hide-mobile">
                  SLA de resposta
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clientes/${c.id}`}>{c.name}</Link>
                  </td>
                  <td>
                    {c.status === 'active' ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge>Inativo</Badge>
                    )}
                  </td>
                  <td className="hide-mobile">{c.ownerName ?? '—'}</td>
                  <td className="hide-mobile">
                    {c.slaResponseHours ? `${c.slaResponseHours} h` : 'Não definido'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
