'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge } from '@/ui/components';
import { APPROVAL_STATUS_LABELS, type ApprovalStatus } from '@/modules/approvals/rules';
import Link from 'next/link';

interface Round {
  id: string;
  round: number;
  status: ApprovalStatus;
  message: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decidedByName: string | null;
  decisionComment: string | null;
}

export function ApprovalPanel(props: {
  contentId: string;
  status: string;
  canSubmit: boolean;
  canReopen: boolean;
  rounds: Round[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = props.rounds.find((r) => r.status === 'pending');
  const sendable = ['in_production', 'internal_review', 'changes_requested'].includes(props.status);

  async function run(
    p: Promise<{ ok: boolean; error?: { message: string; details?: Record<string, string[]> } }>,
  ) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) {
      setError(null);
      setMessage('');
      router.refresh();
    } else setError(Object.values(r.error?.details ?? {})[0]?.[0] ?? r.error?.message ?? 'Erro.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <section className="section stack" aria-labelledby="apc-envio">
        <h2 id="apc-envio">Aprovação do cliente</h2>
        {pending ? (
          <>
            <p>
              A rodada {pending.round} está <strong>aguardando a decisão do cliente</strong> desde{' '}
              {new Date(pending.requestedAt).toLocaleString('pt-BR')}.
            </p>
            {props.canSubmit && (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void run(api('POST', `/api/approvals/${pending.id}/cancel`))}
                >
                  Cancelar envio
                </button>
              </div>
            )}
          </>
        ) : props.status === 'approved' ? (
          <>
            <p>Conteúdo aprovado pelo cliente. Reabrir para edição substitui a aprovação.</p>
            {props.canReopen && (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => void run(api('POST', `/api/contents/${props.contentId}/reopen`))}
                >
                  Reabrir para edição
                </button>
              </div>
            )}
          </>
        ) : sendable && props.canSubmit ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                api('POST', `/api/contents/${props.contentId}/approval`, {
                  message: message || undefined,
                }),
              );
            }}
          >
            <p className="muted">
              O texto atual do editor e os arquivos vinculados serão congelados e enviados ao
              cliente. Observações internas não são enviadas.
            </p>
            <div className="field">
              <label htmlFor="apc-msg">Mensagem ao cliente (opcional)</label>
              <textarea
                id="apc-msg"
                className="input"
                rows={3}
                style={{ padding: 10 }}
                value={message}
                maxLength={2000}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            <div>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Enviar para aprovação do cliente
              </button>
            </div>
          </form>
        ) : (
          <p className="muted">
            Este conteúdo não está em uma situação que permita enviar ao cliente.
          </p>
        )}
      </section>
      <section className="section stack" aria-labelledby="apc-hist">
        <h2 id="apc-hist">Rodadas</h2>
        {props.rounds.length === 0 && <p className="muted">Ainda não foi enviado ao cliente.</p>}
        <ul className="plain-list">
          {props.rounds.map((r) => (
            <li key={r.id}>
              <Link href={`/aprovacoes/${r.id}`}>Rodada {r.round}</Link>{' '}
              <Badge
                tone={
                  r.status === 'approved'
                    ? 'success'
                    : r.status === 'changes_requested'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {APPROVAL_STATUS_LABELS[r.status]}
              </Badge>{' '}
              <span className="muted">
                enviada em {new Date(r.requestedAt).toLocaleString('pt-BR')}
                {r.decidedAt
                  ? ` · decidida por ${r.decidedByName ?? '—'} em ${new Date(r.decidedAt).toLocaleString('pt-BR')}`
                  : ''}
              </span>
              {r.decisionComment && (
                <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>“{r.decisionComment}”</p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
