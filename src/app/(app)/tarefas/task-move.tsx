'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { KANBAN_COLUMNS, TASK_STATUS_LABELS, type TaskStatus } from '@/modules/tasks/rules';

/** Mover de coluna por seleção (acessível por teclado; sem arrastar e soltar). */
export function TaskMove({ id, title, status }: { id: string; title: string; status: TaskStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState(false);

  async function move(to: TaskStatus, reason?: string) {
    const r = await api('POST', `/api/tasks/${id}/status`, { to, reason });
    if (r.ok) {
      setError(null);
      setBlocking(false);
      router.refresh();
    } else setError(r.error?.details?.reason?.[0] ?? r.error?.message ?? 'Não foi possível mover.');
  }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <label className="sr-only" htmlFor={`tm-${id}`}>
        Mover “{title}” (atualmente {TASK_STATUS_LABELS[status]})
      </label>
      <select
        id={`tm-${id}`}
        className="input"
        style={{ minHeight: 36 }}
        value=""
        onChange={(e) => {
          const v = e.target.value as TaskStatus | '';
          if (v === 'blocked') setBlocking(true);
          else if (v) void move(v);
        }}
      >
        <option value="">Mover para…</option>
        {[...KANBAN_COLUMNS, 'cancelled' as TaskStatus]
          .filter((s) => s !== status)
          .map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
      </select>
      {blocking && (
        <form
          className="stack"
          style={{ gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            void move('blocked', String(new FormData(e.currentTarget).get('reason') ?? ''));
          }}
        >
          <label htmlFor={`tr-${id}`} className="field-hint">
            Motivo do bloqueio *
          </label>
          <input id={`tr-${id}`} name="reason" className="input" style={{ minHeight: 36 }} />
          <button type="submit" className="btn btn-secondary btn-sm">
            Bloquear
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
