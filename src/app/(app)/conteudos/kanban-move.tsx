'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { CONTENT_STATUS_LABELS, type ContentStatus } from '@/modules/contents/rules';

/** Mover entre colunas por seleção (acessível por teclado e leitor de tela; sem arrastar e soltar). */
export function KanbanMove({
  id,
  title,
  status,
  targets,
}: {
  id: string;
  title: string;
  status: ContentStatus;
  targets: ContentStatus[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<ContentStatus | ''>('');
  const [error, setError] = useState<string | null>(null);

  async function move(to: ContentStatus, message?: string) {
    const r = await api('POST', `/api/contents/${id}/status`, { to, message });
    if (r.ok) {
      setTarget('');
      setError(null);
      router.refresh();
    } else
      setError(r.error?.details?.message?.[0] ?? r.error?.message ?? 'Não foi possível mover.');
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="sr-only" htmlFor={`mv-${id}`}>
        Mover “{title}” (atualmente {CONTENT_STATUS_LABELS[status]})
      </label>
      <select
        id={`mv-${id}`}
        className="input"
        style={{ minHeight: 36 }}
        value={target}
        onChange={(e) => {
          const v = e.target.value as ContentStatus | '';
          setTarget(v);
          if (v && v !== 'cancelled') void move(v);
        }}
      >
        <option value="">Mover para…</option>
        {targets.map((t) => (
          <option key={t} value={t}>
            {CONTENT_STATUS_LABELS[t]}
          </option>
        ))}
      </select>
      {target === 'cancelled' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void move('cancelled', String(new FormData(e.currentTarget).get('message') ?? ''));
          }}
          className="stack"
          style={{ gap: 6 }}
        >
          <label htmlFor={`mr-${id}`} className="field-hint">
            Motivo do cancelamento *
          </label>
          <input id={`mr-${id}`} name="message" className="input" style={{ minHeight: 36 }} />
          <button type="submit" className="btn btn-danger btn-sm">
            Cancelar conteúdo
          </button>
        </form>
      )}
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
