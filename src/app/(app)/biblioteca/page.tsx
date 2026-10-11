import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listClients } from '@/modules/clients/service';
import { listAssets, listFolders, storageUsage } from '@/modules/library/service';
import { maxUploadBytes } from '@/modules/library/storage';
import { Badge } from '@/ui/components';
import { formatSize } from '@/modules/library/format';
import { EmptyState } from '@/ui/states';
import { Forbidden } from '@/ui/forbidden';
import { Uploader } from './uploader';

export const metadata: Metadata = { title: 'Biblioteca' };

const KINDS: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  pdf: 'PDF',
  document: 'Documento',
  other: 'Outro',
};

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !ctx.grants.some((g) => g.permissions.has('library:view')))
    return <Forbidden />;
  const db = getDb();
  const clientId = sp.clientId && isId(sp.clientId) ? sp.clientId : undefined;
  const folderId = sp.pasta && (sp.pasta === 'root' || isId(sp.pasta)) ? sp.pasta : undefined;
  const [clients, data, usage] = await Promise.all([
    listClients(db, ctx),
    listAssets(db, ctx, {
      clientId,
      folderId,
      kind: sp.tipo || undefined,
      q: sp.q || undefined,
      tag: sp.etiqueta || undefined,
      favorites: sp.favoritos === '1',
      unlinked: sp.sem_uso === '1',
      trash: sp.lixeira === '1',
      before: sp.depois && isId(sp.depois) ? sp.depois : undefined,
    }),
    storageUsage(db, ctx),
  ]);
  const folders = clientId ? await listFolders(db, ctx, clientId).catch(() => []) : [];
  const canUpload = !!clientId && can(ctx, 'library:create', clientId);
  const pct = Math.min(100, Math.round((usage.usedBytes / usage.limitBytes) * 100));
  const trash = sp.lixeira === '1';
  const more = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== 'depois') more.set(k, v);
  if (data.nextBefore) more.set('depois', data.nextBefore);

  return (
    <>
      <div className="page-head">
        <h1>Biblioteca de mídia</h1>
        <div className="row">
          <Link
            href={trash ? '/biblioteca' : '/biblioteca?lixeira=1'}
            className="btn btn-secondary btn-sm"
          >
            {trash ? 'Voltar à biblioteca' : 'Lixeira'}
          </Link>
        </div>
      </div>
      <p className="muted" data-testid="quota">
        Armazenamento: {formatSize(usage.usedBytes)} de {formatSize(usage.limitBytes)} ({pct}%).
      </p>

      <form method="get" className="section form-row" aria-label="Filtros da biblioteca">
        {trash && <input type="hidden" name="lixeira" value="1" />}
        <div className="field">
          <label htmlFor="b-cliente">Cliente</label>
          <select id="b-cliente" name="clientId" className="input" defaultValue={clientId ?? ''}>
            <option value="">Todos</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {clientId && (
          <div className="field">
            <label htmlFor="b-pasta">Pasta</label>
            <select id="b-pasta" name="pasta" className="input" defaultValue={folderId ?? ''}>
              <option value="">Todas</option>
              <option value="root">Sem pasta</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="b-q">Buscar</label>
          <input id="b-q" name="q" className="input" defaultValue={sp.q ?? ''} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="b-tipo">Tipo</label>
          <select id="b-tipo" name="tipo" className="input" defaultValue={sp.tipo ?? ''}>
            <option value="">Todos</option>
            {Object.entries(KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="b-tag">Etiqueta</label>
          <input
            id="b-tag"
            name="etiqueta"
            className="input"
            defaultValue={sp.etiqueta ?? ''}
            maxLength={40}
          />
        </div>
        <label className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="checkbox" name="favoritos" value="1" defaultChecked={sp.favoritos === '1'} />
          Favoritos
        </label>
        <label className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="checkbox" name="sem_uso" value="1" defaultChecked={sp.sem_uso === '1'} />
          Sem uso
        </label>
        <button className="btn btn-primary" type="submit">
          Filtrar
        </button>
      </form>

      {canUpload && !trash && (
        <Uploader
          clientId={clientId!}
          folderId={folderId && folderId !== 'root' ? folderId : undefined}
          maxMb={Math.round(maxUploadBytes() / 1048576)}
        />
      )}
      {!clientId && !trash && (
        <p className="muted">Escolha um cliente no filtro para enviar arquivos.</p>
      )}

      {data.items.length === 0 ? (
        <EmptyState
          title={trash ? 'A lixeira está vazia' : 'Nenhum arquivo encontrado'}
          description={
            trash
              ? 'Arquivos excluídos ficam aqui por 30 dias.'
              : 'Envie imagens, vídeos, PDFs e documentos para reutilizar nos conteúdos.'
          }
        />
      ) : (
        <ul className="asset-grid" aria-label="Arquivos">
          {data.items.map((a) => (
            <li key={a.id} className="asset-card">
              <Link
                href={`/biblioteca/${a.id}${trash ? '?lixeira=1' : ''}`}
                className="asset-thumb"
              >
                {a.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/assets/${a.id}/file`} alt={a.displayName} loading="lazy" />
                ) : (
                  <span aria-hidden="true">{KINDS[a.kind] ?? 'Arquivo'}</span>
                )}
              </Link>
              <div className="asset-meta">
                <strong title={a.displayName}>{a.displayName}</strong>
                <span className="muted">
                  {a.clientName} · {formatSize(a.sizeBytes)}
                </span>
                <span className="row">
                  {a.favorite && <Badge tone="info">Favorito</Badge>}
                  {a.versionNumber > 1 && <Badge tone="neutral">v{a.versionNumber}</Badge>}
                  {a.usedIn === 0 && !trash && <Badge tone="neutral">Sem uso</Badge>}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {data.nextBefore && (
        <p>
          <Link href={`/biblioteca?${more.toString()}`} className="btn btn-secondary">
            Carregar mais
          </Link>
        </p>
      )}
    </>
  );
}
