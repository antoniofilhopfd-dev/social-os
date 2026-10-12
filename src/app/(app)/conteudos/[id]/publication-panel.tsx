'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge } from '@/ui/components';
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from '@/modules/publications/rules';

interface Item {
  id: string;
  status: PublicationStatus;
  scheduledDate: string;
  scheduledTime: string | null;
  publishedAt: string | null;
}

export function PublicationPanel(props: {
  contentId: string;
  status: string;
  hasProfile: boolean;
  canSchedule: boolean;
  canWaive: boolean;
  items: Item[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [conflicts, setConflicts] = useState<string[]>([]);
  const active = props.items.find((i) => i.status === 'scheduled');
  const approved = props.status === 'approved';
  const waivable = ['in_production', 'internal_review'].includes(props.status) && props.canWaive;
  const canForm = !active && props.canSchedule && (approved || waivable);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api<{ id: string; conflicts: { number: number; title: string }[] }>(
      'POST',
      `/api/contents/${props.contentId}/publication`,
      {
        date: String(f.get('date') ?? ''),
        time: String(f.get('time') ?? '') || null,
        waiveApproval: !approved ? f.get('waive') === 'on' : undefined,
      },
    );
    if (r.ok) {
      setError(null);
      setFields({});
      setConflicts((r.data?.conflicts ?? []).map((c) => `#${c.number} ${c.title}`));
      router.refresh();
    } else {
      setError(r.error?.message ?? 'Erro.');
      setFields(r.error?.details ?? {});
    }
  }

  return (
    <div className="stack">
      <section className="section stack" aria-labelledby="pnl-prog">
        <h2 id="pnl-prog">Programar publicação</h2>
        {error && <Alert tone="danger">{error}</Alert>}
        {conflicts.length > 0 && (
          <Alert tone="warning">Conflito de agenda: {conflicts.join('; ')}.</Alert>
        )}
        {!props.hasProfile && (
          <Alert tone="warning">Defina o perfil social na aba “Dados” para poder programar.</Alert>
        )}
        {active ? (
          <p>
            Programada para {active.scheduledDate.split('-').reverse().join('/')}
            {active.scheduledTime ? ` às ${active.scheduledTime}` : ''}.{' '}
            <Link href={`/publicacoes/${active.id}`}>Abrir pacote de publicação</Link>
          </p>
        ) : canForm ? (
          <form className="stack" noValidate onSubmit={submit}>
            <div className="form-row">
              <div className="field">
                <label htmlFor="pnl-date">Data *</label>
                <input
                  id="pnl-date"
                  name="date"
                  type="date"
                  className="input"
                  aria-invalid={fields.date ? true : undefined}
                />
                {fields.date && <span className="field-error">{fields.date[0]}</span>}
              </div>
              <div className="field">
                <label htmlFor="pnl-time">Horário</label>
                <input id="pnl-time" name="time" type="time" className="input" />
                {fields.time && <span className="field-error">{fields.time[0]}</span>}
              </div>
            </div>
            {!approved && (
              <label className="row" style={{ flexWrap: 'nowrap' }}>
                <input type="checkbox" name="waive" />
                Dispensar a aprovação do cliente (fica registrado na auditoria)
              </label>
            )}
            <div>
              <button className="btn btn-primary" type="submit" disabled={!props.hasProfile}>
                Programar
              </button>
            </div>
          </form>
        ) : (
          <p className="muted">
            {props.status === 'published'
              ? 'Este conteúdo já foi publicado.'
              : 'Só conteúdos aprovados pelo cliente podem ser programados.'}
          </p>
        )}
      </section>
      <section className="section stack" aria-labelledby="pnl-hist">
        <h2 id="pnl-hist">Registros</h2>
        {props.items.length === 0 && <p className="muted">Nenhuma programação.</p>}
        <ul className="plain-list">
          {props.items.map((i) => (
            <li key={i.id}>
              <Link href={`/publicacoes/${i.id}`}>
                {i.scheduledDate.split('-').reverse().join('/')}
              </Link>{' '}
              <Badge
                tone={
                  i.status === 'published' ? 'success' : i.status === 'failed' ? 'danger' : 'info'
                }
              >
                {PUBLICATION_STATUS_LABELS[i.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
