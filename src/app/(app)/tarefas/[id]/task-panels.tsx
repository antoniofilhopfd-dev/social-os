'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export function ChecklistPanel({
  taskId,
  items,
  canEdit,
}: {
  taskId: string;
  items: ChecklistItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const isDone = (i: ChecklistItem) => optimistic[i.id] ?? i.done;
  const done = items.filter(isDone).length;

  async function run(p: Promise<{ ok: boolean; error?: { message: string } }>) {
    const r = await p;
    if (r.ok) {
      setError(null);
      router.refresh();
    } else setError(r.error?.message ?? 'Erro.');
  }
  return (
    <section className="section stack" aria-labelledby="tk-check">
      <h2 id="tk-check">
        Checklist{' '}
        <span className="muted" style={{ fontWeight: 400 }}>
          ({done}/{items.length})
        </span>
      </h2>
      {error && <Alert tone="danger">{error}</Alert>}
      {items.length === 0 && <p className="muted">Nenhum item.</p>}
      <ul className="plain-list">
        {items.map((i) => (
          <li
            key={i.id}
            className="row"
            style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}
          >
            <label className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                type="checkbox"
                checked={isDone(i)}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = e.target.checked;
                  setOptimistic((o) => ({ ...o, [i.id]: next }));
                  void run(
                    api('PATCH', `/api/tasks/${taskId}/checklist/${i.id}`, { done: next }),
                  ).finally(() =>
                    setOptimistic((o) =>
                      Object.fromEntries(Object.entries(o).filter(([k]) => k !== i.id)),
                    ),
                  );
                }}
              />
              <span style={{ textDecoration: isDone(i) ? 'line-through' : undefined }}>
                {i.text}
              </span>
            </label>
            {canEdit && (
              <Button
                variant="secondary"
                className="btn-sm"
                aria-label={`Remover item ${i.text}`}
                onClick={() => void run(api('DELETE', `/api/tasks/${taskId}/checklist/${i.id}`))}
              >
                Remover
              </Button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void run(api('POST', `/api/tasks/${taskId}/checklist`, { text })).then(() =>
              setText(''),
            );
          }}
        >
          <input
            className="input"
            style={{ maxWidth: 360 }}
            aria-label="Novo item do checklist"
            placeholder="Novo item"
            value={text}
            maxLength={300}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn-secondary" type="submit">
            Adicionar item
          </button>
        </form>
      )}
    </section>
  );
}

export function CommentsPanel({
  taskId,
  comments,
}: {
  taskId: string;
  comments: { id: string; body: string; authorName: string | null; createdAt: string }[];
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    const r = await api('POST', `/api/tasks/${taskId}/comments`, { body });
    if (r.ok) {
      setBody('');
      setError(null);
      router.refresh();
    } else setError(r.error?.details?.body?.[0] ?? r.error?.message ?? 'Erro.');
  }
  return (
    <section className="section stack" aria-labelledby="tk-coment">
      <h2 id="tk-coment">Comentários</h2>
      {comments.length === 0 && <p className="muted">Nenhum comentário ainda.</p>}
      <ul className="plain-list">
        {comments.map((c) => (
          <li key={c.id}>
            <strong>{c.authorName ?? 'Alguém'}</strong>{' '}
            <span className="muted">{new Date(c.createdAt).toLocaleString('pt-BR')}</span>
            <p style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{c.body}</p>
          </li>
        ))}
      </ul>
      {error && <Alert tone="danger">{error}</Alert>}
      <form onSubmit={send} className="stack">
        <label htmlFor="tk-cbody" className="sr-only">
          Novo comentário
        </label>
        <textarea
          id="tk-cbody"
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
    </section>
  );
}

export function DeleteTask({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <ConfirmDialog
        triggerLabel="Excluir tarefa"
        title="Excluir tarefa?"
        description="A tarefa deixa de aparecer nas listas. Esta ação fica registrada na auditoria."
        confirmLabel="Excluir tarefa"
        onConfirm={() =>
          void api('DELETE', `/api/tasks/${taskId}`).then((r) => {
            if (r.ok) router.push('/tarefas');
            else setError(r.error?.message ?? 'Erro ao excluir.');
          })
        }
      />
    </div>
  );
}
