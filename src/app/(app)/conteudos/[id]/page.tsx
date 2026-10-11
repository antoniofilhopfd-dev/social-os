import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { MANUAL_TRANSITIONS, CONTENT_STATUS_LABELS, FORMAT_LABELS } from '@/modules/contents/rules';
import {
  getContent,
  listContentAssignees,
  listContentHistory,
  listPillars,
} from '@/modules/contents/service';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { PRIORITY_LABELS } from '@/modules/requests/rules';
import { Alert, Badge } from '@/ui/components';
import { ContentForm } from '../content-form';
import { ContentActions } from './content-actions';
import { HistoryList } from './history-list';

export const metadata: Metadata = { title: 'Conteúdo' };

const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export default async function ContentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const { aba } = await searchParams;
  const { ctx, user } = await requireAuthPage();
  if (!isId(id)) notFound();
  const db = getDb();
  let c;
  try {
    c = await getContent(db, ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const editable = c.permissions.edit;
  const internal = ctx.userKind === 'internal';
  const tab = aba === 'historico' && editable ? 'historico' : 'dados';
  const [clients, pillars, assignees] = editable
    ? await Promise.all([
        listClients(db, ctx),
        listPillars(db, ctx),
        c.permissions.assign ? listContentAssignees(db, ctx) : Promise.resolve([]),
      ])
    : [[], [], []];
  const history = tab === 'historico' ? await listContentHistory(db, ctx, id) : [];
  const targets = MANUAL_TRANSITIONS[c.status] ?? [];

  return (
    <>
      <p>
        <Link href="/conteudos">← Voltar aos conteúdos</Link>
      </p>
      <div className="page-head">
        <h1>
          #{c.number} · {c.title}
        </h1>
        <div className="row">
          <Badge
            tone={
              c.status === 'published' || c.status === 'approved'
                ? 'success'
                : c.status === 'draft'
                  ? 'neutral'
                  : 'info'
            }
          >
            {CONTENT_STATUS_LABELS[c.status]}
          </Badge>
          {c.schedule === 'overdue' && <Badge tone="danger">Atrasado</Badge>}
          {c.schedule === 'due_soon' && <Badge tone="warning">Publicação próxima</Badge>}
        </div>
      </div>
      {c.conflicts.length > 0 && (
        <Alert tone="warning">
          Conflito de agenda: há outro conteúdo ativo no mesmo perfil e dia
          {c.scheduledTime ? '/horário' : ''}:{' '}
          {c.conflicts
            .map((x) => `#${x.number} ${x.title}${x.time ? ` (${x.time})` : ''}`)
            .join('; ')}
          .
        </Alert>
      )}
      {c.requestId && internal && (
        <p className="muted">
          Origem: <Link href={`/solicitacoes/${c.requestId}`}>solicitação</Link>.
        </p>
      )}

      {editable && (
        <nav className="row" aria-label="Seções do conteúdo" style={{ margin: '12px 0' }}>
          <Link
            href={`/conteudos/${id}`}
            className={`btn btn-sm ${tab === 'dados' ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={tab === 'dados' ? 'page' : undefined}
          >
            Dados
          </Link>
          <Link
            href={`/conteudos/${id}?aba=historico`}
            className={`btn btn-sm ${tab === 'historico' ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={tab === 'historico' ? 'page' : undefined}
          >
            Histórico
          </Link>
        </nav>
      )}

      {tab === 'historico' ? (
        <HistoryList
          items={history.map((h) => ({
            id: h.id,
            action: h.action,
            actor: h.actorName,
            at: h.createdAt.toISOString(),
            metadata: h.metadata,
          }))}
        />
      ) : editable ? (
        <div className="stack">
          <ContentActions
            id={id}
            status={c.status}
            targets={targets}
            canDelete={c.permissions.delete}
            canDuplicate={c.permissions.create}
          />
          <ContentForm
            mode="edit"
            clients={clients.map((x) => ({ id: x.id, name: x.name }))}
            pillars={pillars}
            assignees={assignees}
            canAssign={c.permissions.assign}
            meId={user.id}
            initial={{
              id: c.id,
              clientId: c.clientId,
              brandId: c.brandId,
              socialProfileId: c.socialProfileId,
              pillarId: c.pillarId,
              campaignId: c.campaignId,
              title: c.title,
              theme: c.theme,
              objective: c.objective,
              audience: c.audience,
              format: c.format,
              brief: c.brief,
              scheduledDate: c.scheduledDate,
              scheduledTime: c.scheduledTime,
              assigneeUserId: c.assigneeUserId,
              priority: c.priority,
            }}
          />
        </div>
      ) : (
        <section className="section" aria-labelledby="ct-ro">
          <h2 id="ct-ro">Dados</h2>
          <dl className="kv">
            <dt>Cliente</dt>
            <dd>
              {c.clientName}
              {c.brandName ? ` · ${c.brandName}` : ''}
            </dd>
            <dt>Formato</dt>
            <dd>{FORMAT_LABELS[c.format]}</dd>
            <dt>Perfil</dt>
            <dd>{c.network ? `${NETWORK_LABELS[c.network]} · ${c.profileLabel}` : '—'}</dd>
            <dt>Pilar / campanha</dt>
            <dd>
              {c.pillarName ?? '—'} / {c.campaignName ?? '—'}
            </dd>
            <dt>Data prevista</dt>
            <dd>
              {fmt(c.scheduledDate)}
              {c.scheduledTime ? ` às ${c.scheduledTime}` : ''}
            </dd>
            <dt>Responsável</dt>
            <dd>{c.assigneeName ?? '—'}</dd>
            <dt>Prioridade</dt>
            <dd>{PRIORITY_LABELS[c.priority]}</dd>
            <dt>Objetivo</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{c.objective ?? '—'}</dd>
            <dt>Briefing</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{c.brief ?? '—'}</dd>
          </dl>
        </section>
      )}
    </>
  );
}
