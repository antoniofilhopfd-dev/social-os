'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'error'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('ok');
    } catch {
      setState('error');
    }
    setTimeout(() => setState('idle'), 2500);
  }
  return (
    <span className="row" style={{ gap: 8 }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => void copy()}
        disabled={!text}
      >
        {label}
      </button>
      <span role="status" aria-live="polite" className="muted">
        {state === 'ok'
          ? 'Copiado!'
          : state === 'error'
            ? 'Não foi possível copiar; selecione o texto manualmente.'
            : ''}
      </span>
    </span>
  );
}

export function PublicationActions(props: {
  id: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string | null;
  canEdit: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [mode, setMode] = useState<'published' | 'failed' | 'reschedule' | null>(null);
  const [busy, setBusy] = useState(false);
  if (props.status !== 'scheduled') return null;

  async function run(
    p: Promise<{ ok: boolean; error?: { message: string; details?: Record<string, string[]> } }>,
  ) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) {
      setError(null);
      setFieldErrors({});
      setMode(null);
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Erro.');
      setFieldErrors(r.error?.details ?? {});
    }
  }
  const fe = (k: string) => fieldErrors[k]?.[0];
  const val = (f: FormData, k: string) => String(f.get(k) ?? '').trim() || null;

  return (
    <section className="section stack" aria-labelledby="pb-acoes">
      <h2 id="pb-acoes">Registrar resultado</h2>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="row">
        {props.canPublish && (
          <button type="button" className="btn btn-primary" onClick={() => setMode('published')}>
            Marcar como publicada
          </button>
        )}
        {props.canPublish && (
          <button type="button" className="btn btn-secondary" onClick={() => setMode('failed')}>
            Registrar falha
          </button>
        )}
        {props.canEdit && (
          <button type="button" className="btn btn-secondary" onClick={() => setMode('reschedule')}>
            Reagendar
          </button>
        )}
        {props.canEdit && (
          <ConfirmDialog
            triggerLabel="Cancelar programação"
            title="Cancelar a programação?"
            description="O conteúdo volta para a situação anterior à programação e pode ser programado de novo."
            confirmLabel="Cancelar programação"
            onConfirm={() => void run(api('POST', `/api/publications/${props.id}/cancel`))}
          />
        )}
      </div>
      {mode === 'published' && (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const when = val(f, 'publishedAt');
            void run(
              api('POST', `/api/publications/${props.id}/published`, {
                postUrl: val(f, 'postUrl'),
                notes: val(f, 'notes'),
                publishedAt: when ? new Date(when).toISOString() : undefined,
              }),
            );
          }}
        >
          <p className="muted">
            Esta ação apenas registra a publicação que você fez na rede; nada é enviado
            automaticamente.
          </p>
          <div className="field">
            <label htmlFor="pb-url">Link da publicação (opcional)</label>
            <input
              id="pb-url"
              name="postUrl"
              className="input"
              inputMode="url"
              maxLength={500}
              aria-invalid={fe('postUrl') ? true : undefined}
            />
            {fe('postUrl') && <span className="field-error">{fe('postUrl')}</span>}
          </div>
          <div className="field">
            <label htmlFor="pb-quando">Data e hora da publicação (padrão: agora)</label>
            <input id="pb-quando" name="publishedAt" type="datetime-local" className="input" />
            {fe('publishedAt') && <span className="field-error">{fe('publishedAt')}</span>}
          </div>
          <div className="field">
            <label htmlFor="pb-notes">Observações</label>
            <textarea
              id="pb-notes"
              name="notes"
              className="input"
              rows={3}
              style={{ padding: 10 }}
              maxLength={2000}
            />
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Confirmar publicação
            </button>
          </div>
        </form>
      )}
      {mode === 'failed' && (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              api('POST', `/api/publications/${props.id}/failed`, {
                reason: String(new FormData(e.currentTarget).get('reason') ?? ''),
              }),
            );
          }}
        >
          <div className="field">
            <label htmlFor="pb-reason">Motivo da falha *</label>
            <textarea
              id="pb-reason"
              name="reason"
              className="input"
              rows={3}
              style={{ padding: 10 }}
              maxLength={1000}
              aria-invalid={fe('reason') ? true : undefined}
            />
            {fe('reason') && <span className="field-error">{fe('reason')}</span>}
          </div>
          <div>
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              Registrar falha
            </button>
          </div>
        </form>
      )}
      {mode === 'reschedule' && (
        <form
          className="stack"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run(
              api('PATCH', `/api/publications/${props.id}`, {
                date: String(f.get('date') ?? ''),
                time: val(f, 'time'),
              }),
            );
          }}
        >
          <div className="form-row">
            <div className="field">
              <label htmlFor="pb-date">Nova data *</label>
              <input
                id="pb-date"
                name="date"
                type="date"
                className="input"
                defaultValue={props.scheduledDate}
              />
              {fe('date') && <span className="field-error">{fe('date')}</span>}
            </div>
            <div className="field">
              <label htmlFor="pb-time">Horário</label>
              <input
                id="pb-time"
                name="time"
                type="time"
                className="input"
                defaultValue={props.scheduledTime ?? ''}
              />
              {fe('time') && <span className="field-error">{fe('time')}</span>}
            </div>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Salvar nova data
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
