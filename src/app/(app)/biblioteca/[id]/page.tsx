import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { AppError } from '@/core/errors';
import { isId } from '@/core/ids';
import { getAsset } from '@/modules/library/service';
import { Badge } from '@/ui/components';
import { formatSize } from '@/modules/library/format';
import { Forbidden } from '@/ui/forbidden';
import { AssetActions } from './asset-actions';

export const metadata: Metadata = { title: 'Arquivo' };

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lixeira?: string }>;
}) {
  const { id } = await params;
  const { lixeira } = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!isId(id)) notFound();
  if (ctx.userKind !== 'internal') return <Forbidden />;
  let a;
  try {
    a = await getAsset(getDb(), ctx, id, { includeTrash: lixeira === '1' });
  } catch (e) {
    if (e instanceof AppError && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const url = `/api/assets/${a.id}/file`;
  return (
    <>
      <p>
        <Link href="/biblioteca">← Voltar à biblioteca</Link>
      </p>
      <div className="page-head">
        <h1>{a.displayName}</h1>
        <div className="row">
          {a.versionNumber > 1 && <Badge tone="neutral">Versão {a.versionNumber}</Badge>}
          {!a.isLatest && <Badge tone="warning">Versão anterior</Badge>}
          {a.deletedAt && <Badge tone="danger">Na lixeira</Badge>}
        </div>
      </div>
      <div className="editor-grid">
        <section className="section stack" aria-labelledby="as-prev">
          <h2 id="as-prev">Visualização</h2>
          {a.deletedAt ? (
            <p className="muted">Arquivos na lixeira não são exibidos. Restaure para visualizar.</p>
          ) : a.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={a.displayName} style={{ maxWidth: '100%', height: 'auto' }} />
          ) : a.kind === 'video' ? (
            <video src={url} controls preload="metadata" style={{ maxWidth: '100%' }} />
          ) : (
            <p className="muted">Sem visualização para este tipo. Use “Baixar”.</p>
          )}
          <dl className="kv">
            <dt>Cliente</dt>
            <dd>
              {a.clientName}
              {a.brandName ? ` · ${a.brandName}` : ''}
            </dd>
            <dt>Tipo / tamanho</dt>
            <dd>
              {a.mime} · {formatSize(a.sizeBytes)}
            </dd>
            <dt>Arquivo original</dt>
            <dd>{a.originalName}</dd>
            <dt>Etiquetas</dt>
            <dd>{a.tags.length ? a.tags.join(', ') : '—'}</dd>
            <dt>Créditos / origem</dt>
            <dd>
              {a.credits ?? '—'} / {a.origin ?? '—'}
            </dd>
            <dt>Descrição</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{a.description ?? '—'}</dd>
          </dl>
          <h3>Usado em</h3>
          {a.usedIn.length === 0 ? (
            <p className="muted">Não vinculado a nenhum conteúdo.</p>
          ) : (
            <ul className="plain-list">
              {a.usedIn.map((u) => (
                <li key={`${u.contentId}-${u.role}`}>
                  <Link href={`/conteudos/${u.contentId}?aba=editor`}>
                    #{u.number} {u.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {a.versions.length > 1 && (
            <>
              <h3>Versões do arquivo</h3>
              <ul className="plain-list">
                {a.versions.map((v) => (
                  <li key={v.id}>
                    {v.id === a.id ? (
                      <strong>Versão {v.version} (esta)</strong>
                    ) : (
                      <Link href={`/biblioteca/${v.id}`}>Versão {v.version}</Link>
                    )}{' '}
                    <span className="muted">
                      · {formatSize(v.sizeBytes)}
                      {v.latest ? ' · atual' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section className="section" aria-labelledby="as-acoes">
          <h2 id="as-acoes">Ações</h2>
          <AssetActions
            id={a.id}
            trashed={!!a.deletedAt}
            favorite={a.favorite}
            canEdit={a.permissions.edit}
            canDelete={a.permissions.delete}
            isLatest={a.isLatest}
            initial={{
              displayName: a.displayName,
              description: a.description ?? '',
              credits: a.credits ?? '',
              origin: a.origin ?? '',
              tags: a.tags.join(', '),
            }}
          />
        </section>
      </div>
    </>
  );
}
