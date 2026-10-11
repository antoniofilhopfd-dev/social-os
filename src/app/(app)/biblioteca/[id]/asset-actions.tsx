'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

export function AssetActions(props: {
  id: string;
  trashed: boolean;
  favorite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isLatest: boolean;
  initial: {
    displayName: string;
    description: string;
    credits: string;
    origin: string;
    tags: string;
  };
}) {
  const { id } = props;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [f, setF] = useState(props.initial);
  const file = useRef<HTMLInputElement>(null);

  async function run(
    p: Promise<{ ok: boolean; error?: { message: string } }>,
    msg?: string,
    then?: () => void,
  ) {
    const r = await p;
    if (r.ok) {
      setError(null);
      setOk(msg ?? null);
      if (then) then();
      else router.refresh();
    } else {
      setOk(null);
      setError(r.error?.message ?? 'Erro.');
    }
  }
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run(
      api('PATCH', `/api/assets/${id}`, {
        displayName: f.displayName,
        description: f.description || null,
        credits: f.credits || null,
        origin: f.origin || null,
        tags: f.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
      'Alterações salvas.',
    );
  };
  async function newVersion() {
    const picked = file.current?.files?.[0];
    if (!picked) return setError('Selecione o arquivo da nova versão.');
    const fd = new FormData();
    fd.set('file', picked);
    try {
      const res = await fetch(`/api/assets/${id}/versions`, { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: { message: string };
      };
      if (res.ok && json.id) router.push(`/biblioteca/${json.id}`);
      else setError(json.error?.message ?? 'Falha no envio.');
    } catch {
      setError('Sem conexão.');
    }
  }

  if (props.trashed)
    return (
      <div className="stack">
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="row">
          {props.canDelete && (
            <Button
              onClick={() =>
                void run(api('POST', `/api/assets/${id}/restore`), 'Restaurado.', () =>
                  router.push('/biblioteca'),
                )
              }
            >
              Restaurar
            </Button>
          )}
          {props.canDelete && (
            <ConfirmDialog
              triggerLabel="Excluir definitivamente"
              title="Excluir definitivamente?"
              description="O arquivo será apagado do armazenamento e não poderá ser recuperado."
              confirmLabel="Excluir definitivamente"
              onConfirm={() =>
                run(api('DELETE', `/api/assets/${id}/purge`), undefined, () =>
                  router.push('/biblioteca?lixeira=1'),
                )
              }
            />
          )}
        </div>
      </div>
    );

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {ok && <Alert tone="success">{ok}</Alert>}
      <div className="row">
        <Button
          variant="secondary"
          aria-pressed={props.favorite}
          onClick={() =>
            void run(api('PUT', `/api/assets/${id}/favorite`, { on: !props.favorite }))
          }
        >
          {props.favorite ? 'Remover dos favoritos' : 'Favoritar'}
        </Button>
        <a className="btn btn-secondary" href={`/api/assets/${id}/file?download=1`}>
          Baixar
        </a>
        {props.canDelete && (
          <ConfirmDialog
            triggerLabel="Mover para a lixeira"
            title="Mover para a lixeira?"
            description="O arquivo fica na lixeira por 30 dias e pode ser restaurado."
            confirmLabel="Mover para a lixeira"
            onConfirm={() =>
              run(api('DELETE', `/api/assets/${id}`), undefined, () => router.push('/biblioteca'))
            }
          />
        )}
      </div>
      {props.canEdit && (
        <form onSubmit={save} className="stack" aria-label="Editar metadados">
          {(
            [
              ['displayName', 'Nome'],
              ['credits', 'Créditos'],
              ['origin', 'Origem'],
              ['tags', 'Etiquetas (separadas por vírgula)'],
            ] as const
          ).map(([k, label]) => (
            <div className="field" key={k}>
              <label htmlFor={`a-${k}`}>{label}</label>
              <input
                id={`a-${k}`}
                className="input"
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
              />
            </div>
          ))}
          <div className="field">
            <label htmlFor="a-description">Descrição</label>
            <textarea
              id="a-description"
              className="input"
              rows={3}
              value={f.description}
              onChange={(e) => setF({ ...f, description: e.target.value })}
            />
          </div>
          <div>
            <button className="btn btn-primary" type="submit">
              Salvar alterações
            </button>
          </div>
        </form>
      )}
      {props.canEdit && props.isLatest && (
        <div className="stack">
          <div className="field">
            <label htmlFor="a-nova">Enviar nova versão do arquivo</label>
            <input id="a-nova" ref={file} type="file" className="input" />
          </div>
          <div>
            <Button variant="secondary" onClick={() => void newVersion()}>
              Enviar nova versão
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
