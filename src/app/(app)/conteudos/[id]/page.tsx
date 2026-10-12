import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { can, canOrgWide } from '@/core/auth/context';
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
import { getEditor, listBlocks } from '@/modules/editor/service';
import { listContentAssets } from '@/modules/library/service';
import { EditorPanel } from './editor-panel';
import { aiAvailableFor } from '@/modules/integrations/service';
import { listContentApprovals } from '@/modules/approvals/service';
import { ApprovalPanel } from './approval-panel';
import { PublicationPanel } from './publication-panel';
import { listPublications } from '@/modules/publications/service';
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
  const tab =
    editable && internal && aba === 'editor'
      ? 'editor'
      : editable &&
          internal &&
          aba === 'aprovacao' &&
          ctx.grants.some((g) => g.permissions.has('approvals:view'))
        ? 'aprovacao'
        : editable &&
            internal &&
            aba === 'publicacao' &&
            ctx.grants.some((g) => g.permissions.has('publications:view'))
          ? 'publicacao'
          : aba === 'historico' && editable
            ? 'historico'
            : 'dados';
  const [clients, pillars, assignees] = editable
    ? await Promise.all([
        listClients(db, ctx),
        listPillars(db, ctx),
        c.permissions.assign ? listContentAssignees(db, ctx) : Promise.resolve([]),
      ])
    : [[], [], []];
  const history = tab === 'historico' ? await listContentHistory(db, ctx, id) : [];
  const editor = tab === 'editor' ? await getEditor(db, ctx, id) : null;
  const rounds = tab === 'aprovacao' ? await listContentApprovals(db, ctx, id) : [];
  const pubs =
    tab === 'publicacao'
      ? (await listPublications(db, ctx, { contentId: id, limit: 50 })).items
      : [];
  const aiEnabled = editor ? await aiAvailableFor(db, ctx.organizationId) : false;
  const blocks = editor ? await listBlocks(db, ctx) : [];
  const linked = editor ? await listContentAssets(db, ctx, id) : [];
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
          {internal && (
            <Link
              href={`/conteudos/${id}?aba=editor`}
              className={`btn btn-sm ${tab === 'editor' ? 'btn-primary' : 'btn-secondary'}`}
              aria-current={tab === 'editor' ? 'page' : undefined}
            >
              Editor
            </Link>
          )}
          {internal && ctx.grants.some((g) => g.permissions.has('approvals:view')) && (
            <Link
              href={`/conteudos/${id}?aba=aprovacao`}
              className={`btn btn-sm ${tab === 'aprovacao' ? 'btn-primary' : 'btn-secondary'}`}
              aria-current={tab === 'aprovacao' ? 'page' : undefined}
            >
              Aprovação
            </Link>
          )}
          {internal && ctx.grants.some((g) => g.permissions.has('publications:view')) && (
            <Link
              href={`/conteudos/${id}?aba=publicacao`}
              className={`btn btn-sm ${tab === 'publicacao' ? 'btn-primary' : 'btn-secondary'}`}
              aria-current={tab === 'publicacao' ? 'page' : undefined}
            >
              Publicação
            </Link>
          )}
          <Link
            href={`/conteudos/${id}?aba=historico`}
            className={`btn btn-sm ${tab === 'historico' ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={tab === 'historico' ? 'page' : undefined}
          >
            Histórico
          </Link>
        </nav>
      )}

      {tab === 'publicacao' ? (
        <PublicationPanel
          contentId={id}
          status={c.status}
          hasProfile={!!c.socialProfileId}
          canSchedule={can(ctx, 'publications:create', c.clientId)}
          canWaive={can(ctx, 'contents:approve', c.clientId)}
          items={pubs.map((p) => ({
            id: p.id,
            status: p.status,
            scheduledDate: p.scheduledDate,
            scheduledTime: p.scheduledTime,
            publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
          }))}
        />
      ) : tab === 'aprovacao' ? (
        <ApprovalPanel
          contentId={id}
          status={c.status}
          canSubmit={can(ctx, 'contents:approve', c.clientId)}
          canReopen={can(ctx, 'contents:approve', c.clientId)}
          rounds={rounds.map((r) => ({
            id: r.id,
            round: r.round,
            status: r.status,
            message: r.message,
            requestedAt: r.requestedAt.toISOString(),
            decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
            decidedByName: r.decidedByName,
            decisionComment: r.decisionComment,
          }))}
        />
      ) : tab === 'editor' && editor ? (
        <EditorPanel
          contentId={id}
          clientId={c.clientId}
          format={c.format}
          network={editor.network}
          canEdit={editor.canEdit}
          initialBody={editor.draft.body}
          initialRevision={editor.draft.revision}
          updatedByName={editor.draft.updatedByName}
          versions={editor.versions.map((v) => ({
            id: v.id,
            number: v.number,
            note: v.note,
            source: v.source,
            createdAt: v.createdAt.toISOString(),
            createdByName: v.createdByName,
          }))}
          blocks={blocks.map((b) => ({ id: b.id, name: b.name, kind: b.kind, text: b.text }))}
          linked={linked}
          aiEnabled={aiEnabled}
          canManageIntegrations={canOrgWide(ctx, 'integrations:manage_integrations')}
        />
      ) : tab === 'historico' ? (
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
          {internal && ctx.grants.some((g) => g.permissions.has('tasks:view')) && (
            <p className="row">
              <Link href={`/tarefas?view=lista&contentId=${id}`}>Tarefas deste conteúdo</Link>
              {ctx.grants.some((g) => g.permissions.has('tasks:create')) && (
                <Link href={`/tarefas/nova?conteudoId=${id}`}>Nova tarefa para este conteúdo</Link>
              )}
            </p>
          )}
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
            {internal && (
              <>
                <dt>Responsável</dt>
                <dd>{c.assigneeName ?? '—'}</dd>
              </>
            )}
            <dt>Prioridade</dt>
            <dd>{PRIORITY_LABELS[c.priority]}</dd>
            <dt>Objetivo</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{c.objective ?? '—'}</dd>
            {internal && (
              <>
                <dt>Briefing</dt>
                <dd style={{ whiteSpace: 'pre-wrap' }}>{c.brief ?? '—'}</dd>
              </>
            )}
          </dl>
        </section>
      )}
    </>
  );
}
