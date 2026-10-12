import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { APPROVAL_STATUS_LABELS, CLIENT_BODY_FIELDS } from '@/modules/approvals/rules';
import { getApproval } from '@/modules/approvals/service';
import { FORMAT_LABELS } from '@/modules/contents/rules';
import { FIELD_LABELS } from '@/modules/editor/rules';
import { Alert, Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { ApprovalComments, DecisionPanel } from '../decision-panel';

export const metadata: Metadata = { title: 'Aprovação' };
const fmt = (d: Date | null) => (d ? d.toLocaleString('pt-BR') : '—');

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  if (!ctx.grants.some((g) => g.permissions.has('approvals:view'))) return <Forbidden />;
  let a;
  try {
    a = await getApproval(getDb(), ctx, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const internal = ctx.userKind === 'internal';
  const asset = (assetId: string) => `/api/approvals/${a.id}/assets/${assetId}/file`;
  return (
    <>
      <p>
        <Link href="/aprovacoes">← Voltar às aprovações</Link>
      </p>
      <div className="page-head">
        <h1>
          #{a.content.number} · {a.content.title}
        </h1>
        <Badge
          tone={
            a.status === 'approved'
              ? 'success'
              : a.status === 'changes_requested'
                ? 'danger'
                : 'warning'
          }
        >
          {APPROVAL_STATUS_LABELS[a.status]}
        </Badge>
      </div>
      <dl className="kv section">
        <dt>Formato</dt>
        <dd>{FORMAT_LABELS[a.content.format]}</dd>
        <dt>Publicação prevista</dt>
        <dd>
          {a.content.scheduledDate
            ? a.content.scheduledDate.split('-').reverse().join('/')
            : 'a definir'}
          {a.content.scheduledTime ? ` às ${a.content.scheduledTime.slice(0, 5)}` : ''}
        </dd>
        <dt>Rodada / versão</dt>
        <dd>
          {a.round} · versão {a.versionNumber} do texto
        </dd>
        <dt>Enviado por</dt>
        <dd>
          {a.requestedByName ?? '—'} em {fmt(a.requestedAt)}
        </dd>
        {a.message && (
          <>
            <dt>Mensagem da equipe</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{a.message}</dd>
          </>
        )}
        {a.decidedAt && (
          <>
            <dt>Decisão</dt>
            <dd>
              {APPROVAL_STATUS_LABELS[a.status]} por {a.decidedByName ?? '—'} em {fmt(a.decidedAt)}
              {a.decisionComment ? `: ${a.decisionComment}` : ''}
            </dd>
          </>
        )}
      </dl>
      {a.status === 'superseded' && (
        <Alert tone="warning">
          Esta rodada foi substituída: o conteúdo foi reaberto para edição.
        </Alert>
      )}

      <section className="section stack" aria-labelledby="ap-conteudo">
        <h2 id="ap-conteudo">Conteúdo enviado</h2>
        {a.assets.length > 0 && (
          <div className="asset-grid" role="list" aria-label="Arquivos do conteúdo">
            {a.assets.map((f) => (
              <div key={f.id} className="asset-card" role="listitem">
                {f.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset(f.id)}
                    alt={f.name}
                    style={{ width: '100%', height: 'auto', display: 'block' }}
                  />
                ) : f.kind === 'video' ? (
                  <video src={asset(f.id)} controls preload="metadata" style={{ width: '100%' }} />
                ) : null}
                <div className="asset-meta">
                  <strong title={f.name}>{f.name}</strong>
                  <a href={`${asset(f.id)}?download=1`}>Baixar</a>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="preview" data-testid="approval-body">
          {CLIENT_BODY_FIELDS.filter((f) => a.body[f].trim()).map((f) => (
            <div key={f}>
              <strong>{FIELD_LABELS[f]}</strong>
              <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{a.body[f]}</p>
            </div>
          ))}
          {a.body.slides.length > 0 && (
            <div>
              <strong>{FIELD_LABELS.slides}</strong>
              <ol>
                {a.body.slides.map((s, i) => (
                  <li key={i}>
                    {s.title && <strong>{s.title}</strong>} {s.text}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {a.permissions.decide && <DecisionPanel approvalId={a.id} />}
      <ApprovalComments
        approvalId={a.id}
        canComment={a.permissions.comment}
        comments={a.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
      {a.rounds.length > 1 && (
        <section className="section stack" aria-labelledby="ap-rodadas">
          <h2 id="ap-rodadas">Rodadas deste conteúdo</h2>
          <ul className="plain-list">
            {a.rounds.map((r) => (
              <li key={r.id}>
                {r.id === a.id ? (
                  <strong>Rodada {r.round} (esta)</strong>
                ) : (
                  <Link href={`/aprovacoes/${r.id}`}>Rodada {r.round}</Link>
                )}{' '}
                · {APPROVAL_STATUS_LABELS[r.status]}
                {r.decisionComment ? ` · “${r.decisionComment}”` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
      {internal && (
        <p>
          <Link href={`/conteudos/${a.content.id}?aba=aprovacao`}>Abrir o conteúdo</Link>
        </p>
      )}
    </>
  );
}
