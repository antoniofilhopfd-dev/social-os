import type { Metadata } from 'next';
import { getDb } from '@/db';
import { can, canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClients } from '@/modules/clients/service';
import { Forbidden } from '@/ui/forbidden';
import { ClientsClient } from './clients-client';

export const metadata: Metadata = { title: 'Clientes' };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('clients:view'))) return <Forbidden />;
  const rows = await listClients(getDb(), ctx, { q });
  return (
    <>
      <div className="page-head">
        <h1>Clientes</h1>
      </div>
      <p className="muted">
        Cadastro mínimo (nome). O cadastro completo de clientes e marcas chega na Etapa 04.
      </p>
      {q && (
        <p className="muted">
          Filtrando por “{q}”. <a href="/clientes">Limpar filtro</a>
        </p>
      )}
      <ClientsClient
        clients={rows.map((c) => ({
          id: c.id,
          name: c.name,
          canEdit: can(ctx, 'clients:edit', c.id),
          canDelete: can(ctx, 'clients:delete', c.id),
        }))}
        canCreate={canOrgWide(ctx, 'clients:create')}
      />
    </>
  );
}
