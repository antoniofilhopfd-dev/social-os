import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { AppError } from '@/core/errors';
import { listBrands, listClientHistory, listContacts, listDates } from '@/modules/clients/children';
import { getClient, listOwnerCandidates } from '@/modules/clients/service';
import { Badge } from '@/ui/components';
import { listCampaigns } from '@/modules/contents/campaigns';
import { BrandsTab } from './brands-tab';
import { CampaignsTab } from './campaigns-tab';
import { ContactsTab, DatesTab } from './contacts-dates-tabs';
import { GeneralTab } from './general-tab';
import { HistoryTab } from './history-tab';

export const metadata: Metadata = { title: 'Cliente' };

const TABS = [
  ['geral', 'Dados e diretrizes'],
  ['contatos', 'Contatos'],
  ['datas', 'Datas importantes'],
  ['marcas', 'Marcas e perfis'],
  ['campanhas', 'Campanhas'],
  ['historico', 'Histórico'],
] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba } = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  const db = getDb();
  let client;
  try {
    client = await getClient(db, ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const editable = can(ctx, 'clients:edit', id);
  const deletable = can(ctx, 'clients:delete', id);
  const internal = ctx.userKind === 'internal';
  const tabs = TABS.filter(([k]) => k !== 'historico' || (editable && internal));
  const tab = tabs.some(([k]) => k === aba) ? aba! : 'geral';

  return (
    <>
      <div className="page-head">
        <h1>{client.name}</h1>
        {client.status === 'active' ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}
      </div>
      <p>
        <Link href="/clientes">← Voltar aos clientes</Link>
      </p>
      <nav className="row" aria-label="Seções do cliente" style={{ marginBottom: 16 }}>
        {tabs.map(([k, label]) => (
          <Link
            key={k}
            href={`/clientes/${id}?aba=${k}`}
            className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={tab === k ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {tab === 'geral' && (
        <GeneralTab
          client={{ ...client, createdAt: undefined, updatedAt: undefined } as never}
          owners={editable ? await listOwnerCandidates(db, ctx) : []}
          canEdit={editable}
          canDelete={deletable}
          showInternalNotes={internal && editable}
        />
      )}
      {tab === 'contatos' && (
        <ContactsTab
          clientId={id}
          contacts={(await listContacts(db, ctx, id)).map((c) => ({
            ...c,
            createdAt: undefined,
            updatedAt: undefined,
          }))}
          canEdit={editable}
        />
      )}
      {tab === 'datas' && (
        <DatesTab
          clientId={id}
          dates={(await listDates(db, ctx, id)).map((d) => ({
            id: d.id,
            label: d.label,
            eventDate: d.eventDate,
            yearly: d.yearly === 1,
            note: d.note,
          }))}
          canEdit={editable}
        />
      )}
      {tab === 'marcas' && (
        <BrandsTab
          clientId={id}
          brands={JSON.parse(JSON.stringify(await listBrands(db, ctx, id)))}
          owners={editable ? await listOwnerCandidates(db, ctx) : []}
          canEdit={editable}
          canDelete={deletable}
        />
      )}
      {tab === 'campanhas' && (
        <CampaignsTab
          clientId={id}
          campaigns={await listCampaigns(db, ctx, id)}
          canEdit={editable}
          canDelete={deletable}
        />
      )}
      {tab === 'historico' && (
        <HistoryTab
          items={(await listClientHistory(db, ctx, id)).map((h) => ({
            id: h.id,
            action: h.action,
            actor: h.actorName,
            at: h.createdAt.toISOString(),
            metadata: h.metadata,
          }))}
        />
      )}
    </>
  );
}
