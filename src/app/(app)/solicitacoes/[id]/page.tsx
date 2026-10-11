import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { getRequest, listAssignees, listRequestTypes } from '@/modules/requests/service';
import { RequestDetail } from './request-detail';

export const metadata: Metadata = { title: 'Solicitação' };

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  const db = getDb();
  let data;
  try {
    data = await getRequest(db, ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const canAssign = can(ctx, 'requests:assign', data.clientId);
  const canEdit = can(ctx, 'requests:edit', data.clientId);
  const [assignees, types, clients] = await Promise.all([
    canAssign ? listAssignees(db, ctx) : Promise.resolve([]),
    canEdit ? listRequestTypes(db, ctx) : Promise.resolve([]),
    canEdit ? listClients(db, ctx) : Promise.resolve([]),
  ]);
  return (
    <>
      <p>
        <Link href="/solicitacoes">← Voltar às solicitações</Link>
      </p>
      <RequestDetail
        data={JSON.parse(JSON.stringify(data))}
        assignees={assignees}
        types={types}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        internal={ctx.userKind === 'internal'}
        canConvert={
          ctx.userKind === 'internal' && canEdit && can(ctx, 'contents:create', data.clientId)
        }
      />
    </>
  );
}
