import type { Metadata } from 'next';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClients } from '@/modules/clients/service';
import { listRequestTypes } from '@/modules/requests/service';
import { Forbidden } from '@/ui/forbidden';
import { RequestForm } from '../request-form';

export const metadata: Metadata = { title: 'Nova solicitação' };

export default async function NewRequestPage() {
  const { ctx } = await requireAuthPage();
  const db = getDb();
  if (!ctx.grants.some((g) => g.permissions.has('requests:create'))) return <Forbidden />;
  const [clients, types] = await Promise.all([listClients(db, ctx), listRequestTypes(db, ctx)]);
  const allowed = clients.filter((c) => can(ctx, 'requests:create', c.id));
  return (
    <>
      <div className="page-head">
        <h1>Nova solicitação</h1>
      </div>
      <RequestForm
        mode="create"
        clients={allowed.map((c) => ({ id: c.id, name: c.name }))}
        types={types}
      />
    </>
  );
}
