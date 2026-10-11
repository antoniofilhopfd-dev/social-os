import type { Metadata } from 'next';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listRequestTypes } from '@/modules/requests/service';
import { Forbidden } from '@/ui/forbidden';
import { TypesClient } from './types-client';

export const metadata: Metadata = { title: 'Tipos de solicitação' };

export default async function RequestTypesPage() {
  const { ctx } = await requireAuthPage();
  if (!canOrgWide(ctx, 'settings:view')) return <Forbidden />;
  const types = await listRequestTypes(getDb(), ctx, { includeInactive: true });
  return (
    <>
      <div className="page-head">
        <h1>Tipos de solicitação</h1>
      </div>
      <p className="muted">
        Defina quais campos são obrigatórios em cada tipo. Cliente, título e descrição são sempre
        obrigatórios. Tipos desativados deixam de aparecer no formulário, mas as solicitações
        existentes são mantidas.
      </p>
      <TypesClient types={types} canEdit={canOrgWide(ctx, 'settings:edit')} />
    </>
  );
}
