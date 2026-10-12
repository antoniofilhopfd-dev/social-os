import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { FORMAT_LABELS } from '@/modules/contents/rules';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { PUBLICATION_STATUS_LABELS } from '@/modules/publications/rules';
import { getPublication } from '@/modules/publications/service';
import { can } from '@/core/auth/context';
import { todayLocal } from '@/core/time';
import { listPublicationMetrics } from '@/modules/metrics/service';
import { MetricsPanel } from '../../resultados/metrics-form';
import { Alert, Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { CopyButton, PublicationActions } from '../actions';

export const metadata: Metadata = { title: 'Publicação' };
const fmtD = (d: string) => d.split('-').reverse().join('/');
const KIND: Record<string, string> = {
  scheduled: 'Programada',
  rescheduled: 'Reagendada',
  published: 'Marcada como publicada',
  failed: 'Falha registrada',
  cancelled: 'Programação cancelada',
};

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  if (ctx.userKind !== 'internal') return <Forbidden />;
  let p;
  try {
    p = await getPublication(getDb(), ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const pk = p.package;
  const showMetrics =
    p.status === 'published' && ctx.grants.some((g) => g.permissions.has('metrics:view'));
  const entries = showMetrics ? await listPublicationMetrics(getDb(), ctx, id) : [];
  return (
    <>
      <p>
        <Link href="/publicacoes">← Voltar às publicações</Link>
      </p>
      <div className="page-head">
        <h1>
          #{p.content.number} · {p.content.title}
        </h1>
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
      </div>
      {p.status === 'failed' && p.failureReason && (
        <Alert tone="danger">Falha registrada: {p.failureReason}</Alert>
      )}
      <dl className="kv section">
        <dt>Perfil</dt>
        <dd>{p.profile ? `${NETWORK_LABELS[p.profile.network]} · @${p.profile.handle}` : '—'}</dd>
        <dt>Formato</dt>
        <dd>{FORMAT_LABELS[p.content.format]}</dd>
        <dt>Programada para</dt>
        <dd>
          {fmtD(p.scheduledDate)}
          {p.scheduledTime ? ` às ${p.scheduledTime}` : ''}
        </dd>
        {p.publishedAt && (
          <>
            <dt>Publicada em</dt>
            <dd>{p.publishedAt.toLocaleString('pt-BR')}</dd>
          </>
        )}
        {p.postUrl && (
          <>
            <dt>Link</dt>
            <dd>
              <a href={p.postUrl} target="_blank" rel="noopener noreferrer nofollow">
                {p.postUrl}
              </a>
            </dd>
          </>
        )}
        {p.notes && (
          <>
            <dt>Observações</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{p.notes}</dd>
          </>
        )}
        <dt>Conteúdo</dt>
        <dd>
          <Link href={`/conteudos/${p.content.id}`}>Abrir o conteúdo</Link>
        </dd>
      </dl>

      {p.status === 'scheduled' && (
        <p className="muted" data-testid="auto-publish-note">
          Publicação automática indisponível: a conexão com a rede não está configurada (veja os
          requisitos em <Link href="/configuracoes/integracoes">Integrações</Link>). Publique
          manualmente e registre o resultado abaixo.
        </p>
      )}

      <PublicationActions
        id={p.id}
        status={p.status}
        scheduledDate={p.scheduledDate}
        scheduledTime={p.scheduledTime}
        canEdit={p.permissions.edit}
        canPublish={p.permissions.publish}
      />

      <section className="section stack" aria-labelledby="pb-pacote">
        <h2 id="pb-pacote">Pacote de publicação</h2>
        <p className="muted">
          {pk.source === 'approved'
            ? 'Texto da versão aprovada pelo cliente.'
            : pk.source === 'version'
              ? 'Texto da última versão salva (sem aprovação do cliente).'
              : 'Texto do rascunho atual (nenhuma versão foi salva).'}
        </p>
        <div className="stack">
          <strong>Texto completo</strong>
          <div className="preview" data-testid="post-text" style={{ whiteSpace: 'pre-wrap' }}>
            {pk.text || 'Sem texto.'}
          </div>
          <CopyButton text={pk.text} label="Copiar texto completo" />
        </div>
        {pk.altText && (
          <div className="stack">
            <strong>Texto alternativo</strong>
            <p style={{ margin: 0 }}>{pk.altText}</p>
            <CopyButton text={pk.altText} label="Copiar texto alternativo" />
          </div>
        )}
        {pk.publishNotes && (
          <div>
            <strong>Orientações de publicação</strong>
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{pk.publishNotes}</p>
          </div>
        )}
        {pk.assets.length > 0 && (
          <div className="stack">
            <strong>Arquivos</strong>
            <ul className="plain-list">
              {pk.assets.map((a) => (
                <li key={a.id} className="row">
                  {a.name} <Badge tone="neutral">{a.role === 'cover' ? 'Capa' : 'Arquivo'}</Badge>
                  {a.trashed ? (
                    <Badge tone="danger">Na lixeira</Badge>
                  ) : (
                    <a href={`/api/assets/${a.id}/file?download=1`}>Baixar</a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {showMetrics && (
        <MetricsPanel
          publicationId={p.id}
          canCreate={can(ctx, 'metrics:create', p.content.clientId)}
          publishedDay={p.publishedAt ? todayLocal(p.publishedAt) : ''}
          entries={entries.map((e) => ({
            id: e.id,
            capturedOn: e.capturedOn,
            values: {
              reach: e.reach,
              impressions: e.impressions,
              clicks: e.clicks,
              videoViews: e.videoViews,
            },
            interactions: e.interactions,
            engagementRate: e.engagementRate,
            notes: e.notes,
            createdByName: e.createdByName,
            canEdit: e.canEdit,
          }))}
        />
      )}

      <section className="section stack" aria-labelledby="pb-hist">
        <h2 id="pb-hist">Histórico</h2>
        <ul className="plain-list">
          {p.events.map((e) => (
            <li key={e.id}>
              {KIND[e.kind] ?? e.kind}{' '}
              <span className="muted">
                · {e.actorName ?? 'Sistema'} · {e.createdAt.toLocaleString('pt-BR')}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
