'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { CONTENT_STATUS_LABELS, type ContentStatus } from '@/modules/contents/rules';

export function ContentActions({
  id,
  status,
  targets,
  canDelete,
  canDuplicate,
}: {
  id: string;
  status: ContentStatus;
  targets: ContentStatus[];
  canDelete: boolean;
  canDuplicate: boolean;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ContentStatus | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();

  async function applyStatus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = String(new FormData(e.currentTarget).get('message') ?? '');
    const r = await api('POST', `/api/contents/${id}/status`, {
      to: target,
      message: message || undefined,
    });
    if (r.ok) {
      setTarget('');
      setError(null);
      setDetails(undefined);
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Erro.');
      setDetails(r.error?.details);
    }
  }
  async function duplicate() {
    const r = await api<{ id: string }>('POST', `/api/contents/${id}/duplicate`);
    if (r.ok) router.push(`/conteudos/${r.data!.id}`);
    else setError(r.error?.message ?? 'Erro ao duplicar.');
  }
  async function remove() {
    const r = await api('DELETE', `/api/contents/${id}`);
    if (r.ok) router.push('/conteudos');
    else setError(r.error?.message ?? 'Erro ao excluir.');
  }

  return (
    <section className="section stack" aria-labelledby="ct-acoes">
      <h2 id="ct-acoes">Situação e ações</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="muted">
        Situação atual: <strong>{CONTENT_STATUS_LABELS[status]}</strong>. Aprovação do cliente e
        publicação são registradas pelos próprios fluxos (Etapas 08 e 09).
      </p>
      {targets.length > 0 && (
        <form onSubmit={applyStatus} className="form-row" noValidate>
          <div className="field">
            <label htmlFor="ct-to">Mudar situação para</label>
            <select
              id="ct-to"
              className="input"
              value={target}
              onChange={(e) => setTarget(e.target.value as ContentStatus)}
            >
              <option value="">Selecione…</option>
              {targets.map((t) => (
                <option key={t} value={t}>
                  {CONTENT_STATUS_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          {target === 'cancelled' && (
            <div className="field">
              <label htmlFor="ct-msg">Motivo do cancelamento *</label>
              <input id="ct-msg" name="message" className="input" />
              {details?.message?.[0] && <span className="field-error">{details.message[0]}</span>}
            </div>
          )}
          <div>
            <Button type="submit" disabled={!target}>
              Aplicar
            </Button>
          </div>
        </form>
      )}
      <div className="actions">
        {canDuplicate && (
          <Button variant="secondary" onClick={duplicate}>
            Duplicar conteúdo
          </Button>
        )}
        {canDelete && (
          <ConfirmDialog
            triggerLabel="Excluir conteúdo"
            title="Excluir este conteúdo?"
            description="O conteúdo vai para a lixeira. A recuperação será disponibilizada na Etapa 11."
            confirmLabel="Excluir"
            onConfirm={remove}
          />
        )}
      </div>
    </section>
  );
}
