'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';

export function DecisionPanel({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(decision: 'approved' | 'changes_requested') {
    if (busy) return;
    setBusy(true);
    const r = await api('POST', `/api/approvals/${approvalId}/decision`, {
      decision,
      comment: comment || undefined,
    });
    setBusy(false);
    if (r.ok) {
      setError(null);
      router.refresh();
    } else
      setError(r.error?.details?.comment?.[0] ?? r.error?.message ?? 'Não foi possível registrar.');
  }

  return (
    <section className="section stack" aria-labelledby="ap-decisao">
      <h2 id="ap-decisao">Sua decisão</h2>
      <p className="muted">
        Aprove se o conteúdo pode seguir para publicação. Se algo precisar mudar, descreva os
        ajustes.
      </p>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="field">
        <label htmlFor="ap-comentario">Comentário (obrigatório para pedir ajustes)</label>
        <textarea
          id="ap-comentario"
          className="input"
          rows={4}
          style={{ padding: 10 }}
          value={comment}
          maxLength={3000}
          onChange={(e) => setComment(e.target.value)}
        />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void send('approved')}
        >
          Aprovar
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void send('changes_requested')}
        >
          Solicitar ajustes
        </button>
      </div>
    </section>
  );
}

export function ApprovalComments({
  approvalId,
  comments,
  canComment,
}: {
  approvalId: string;
  comments: {
    id: string;
    body: string;
    authorName: string | null;
    fromClient: boolean;
    createdAt: string;
  }[];
  canComment: boolean;
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await api('POST', `/api/approvals/${approvalId}/comments`, { body });
    if (r.ok) {
      setBody('');
      setError(null);
      router.refresh();
    } else setError(r.error?.details?.body?.[0] ?? r.error?.message ?? 'Erro.');
  }
  return (
    <section className="section stack" aria-labelledby="ap-coment">
      <h2 id="ap-coment">Conversa</h2>
      {comments.length === 0 && <p className="muted">Nenhum comentário ainda.</p>}
      <ul className="plain-list">
        {comments.map((c) => (
          <li key={c.id}>
            <strong>{c.authorName ?? 'Alguém'}</strong>{' '}
            <span className="muted">
              {c.fromClient ? '(cliente) ' : '(equipe) '}
              {new Date(c.createdAt).toLocaleString('pt-BR')}
            </span>
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{c.body}</p>
          </li>
        ))}
      </ul>
      {canComment && (
        <form onSubmit={send} className="stack">
          {error && <Alert tone="danger">{error}</Alert>}
          <label htmlFor="ap-cbody" className="sr-only">
            Novo comentário
          </label>
          <textarea
            id="ap-cbody"
            className="input"
            rows={3}
            style={{ padding: 10 }}
            placeholder="Escreva um comentário"
            value={body}
            maxLength={3000}
            onChange={(e) => setBody(e.target.value)}
          />
          <div>
            <button className="btn btn-secondary" type="submit" disabled={!body.trim()}>
              Comentar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
