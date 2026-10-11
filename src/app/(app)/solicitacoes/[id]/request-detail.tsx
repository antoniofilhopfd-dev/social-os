'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { fieldError } from '@/ui/form-utils';
import { EVENT_LABELS, NETWORK_LABELS } from '@/modules/requests/labels';
import {
  CONFIGURABLE_FIELDS,
  MESSAGE_REQUIRED,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TRANSITIONS,
  type RequestStatus,
} from '@/modules/requests/rules';
import { RequestForm } from '../request-form';

interface EventRow {
  id: string;
  kind: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  internalOnly: boolean;
  createdAt: string;
  actorName: string | null;
}
interface Data {
  id: string;
  number: number;
  clientId: string;
  clientName: string;
  brandName: string | null;
  typeId: string;
  typeName: string;
  brandId: string | null;
  requesterName: string;
  title: string;
  description: string;
  objective: string | null;
  audience: string | null;
  network: string | null;
  format: string | null;
  desiredDate: string | null;
  referenceNotes: string | null;
  approvalRequired: boolean;
  priority: keyof typeof PRIORITY_LABELS;
  originalPriority: keyof typeof PRIORITY_LABELS;
  urgencyReason: string | null;
  status: RequestStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  estimatedDue: string | null;
  firstResponseDueAt: string | null;
  firstResponseAt: string | null;
  possibleDuplicateOf: string | null;
  createdAt: string;
  sla: 'ok' | 'response_overdue' | 'due_overdue';
  missing: string[];
  permissions: { edit: boolean; assign: boolean; comment: boolean };
  events: EventRow[];
  convertedToType: string | null;
  convertedToId: string | null;
}

const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');
const fmtTime = (d: string) =>
  new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const STATUS_TONE = {
  new: 'info',
  in_triage: 'warning',
  awaiting_info: 'warning',
  accepted: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
} as const;

function describe(e: EventRow): string | null {
  const m = e.metadata ?? {};
  if (e.kind === 'status_changed' || e.kind === 'info_requested')
    return `${STATUS_LABELS[m.from as RequestStatus] ?? ''} → ${STATUS_LABELS[m.to as RequestStatus] ?? ''}`;
  if (e.kind === 'priority_changed')
    return `${PRIORITY_LABELS[m.from as keyof typeof PRIORITY_LABELS]} → ${PRIORITY_LABELS[m.to as keyof typeof PRIORITY_LABELS]} (original: ${PRIORITY_LABELS[m.original as keyof typeof PRIORITY_LABELS]})`;
  if (e.kind === 'updated' && m.changes)
    return `Campos: ${Object.keys(m.changes as object).join(', ')}`;
  if (e.kind === 'assigned')
    return m.estimatedDue ? `Prazo estimado: ${fmtDate(m.estimatedDue as string)}` : null;
  return null;
}

export function RequestDetail({
  data,
  assignees,
  types,
  clients,
  internal,
  canConvert,
}: {
  canConvert: boolean;
  data: Data;
  assignees: { id: string; name: string }[];
  types: { id: string; name: string; requiredFields: string[] }[];
  clients: { id: string; name: string }[];
  internal: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState<RequestStatus | ''>('');
  const closed = data.status === 'rejected' || data.status === 'cancelled';
  const nextStates = TRANSITIONS[data.status];

  const refresh = () => {
    setError(null);
    setDetails(undefined);
    router.refresh();
  };
  const fail = (r: { error?: { message: string; details?: Record<string, string[]> } }) => {
    setDetails(r.error?.details);
    setError(r.error?.message ?? 'Erro.');
  };

  async function applyStatus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const msg = String(new FormData(e.currentTarget).get('message') ?? '');
    const r = await api('POST', `/api/requests/${data.id}/status`, {
      to: target,
      message: msg || undefined,
    });
    if (r.ok) {
      setTarget('');
      refresh();
    } else fail(r);
  }
  async function assign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api('POST', `/api/requests/${data.id}/assign`, {
      assigneeUserId: (f.get('assignee') as string) || null,
      estimatedDue: (f.get('due') as string) || null,
    });
    if (r.ok) refresh();
    else fail(r);
  }
  async function convert() {
    const r = await api<{ id: string }>('POST', `/api/requests/${data.id}/convert`);
    if (r.ok) router.push(`/conteudos/${r.data!.id}`);
    else fail(r);
  }
  async function comment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api('POST', `/api/requests/${data.id}/comments`, {
      body: f.get('body'),
      internalOnly: f.get('internalOnly') === 'on',
    });
    if (r.ok) {
      form.reset();
      refresh();
    } else fail(r);
  }

  if (editing) {
    return (
      <>
        <div className="page-head">
          <h1>Editar #{data.number}</h1>
        </div>
        <RequestForm
          mode="edit"
          clients={clients}
          types={types}
          initial={{ ...data, approvalRequired: data.approvalRequired }}
        />
      </>
    );
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>
          #{data.number} · {data.title}
        </h1>
        <div className="row">
          <Badge tone={STATUS_TONE[data.status]}>{STATUS_LABELS[data.status]}</Badge>
          {(data.priority === 'urgent' || data.priority === 'high') && (
            <Badge tone={data.priority === 'urgent' ? 'danger' : 'warning'}>
              {PRIORITY_LABELS[data.priority]}
            </Badge>
          )}
          {data.sla === 'response_overdue' && <Badge tone="danger">Sem resposta no prazo</Badge>}
          {data.sla === 'due_overdue' && <Badge tone="warning">Prazo vencido</Badge>}
        </div>
      </div>
      {error && (
        <Alert tone="danger">
          {error}
          {details && Object.entries(details).map(([k, v]) => <div key={k}>• {v[0]}</div>)}
        </Alert>
      )}
      {data.possibleDuplicateOf && (
        <Alert tone="warning">
          Esta solicitação foi criada mesmo havendo uma parecida em aberto. Verifique se não é
          duplicada.
        </Alert>
      )}
      {data.permissions.edit && data.missing.length > 0 && !closed && (
        <Alert tone="warning">
          Campos obrigatórios deste tipo ainda ausentes:{' '}
          {data.missing
            .map((k) => CONFIGURABLE_FIELDS[k as keyof typeof CONFIGURABLE_FIELDS])
            .join(', ')}
          . A solicitação não pode ser aceita até completá-los.
        </Alert>
      )}

      <section className="section" aria-labelledby="rq-dados">
        <div className="page-head" style={{ marginBottom: 8 }}>
          <h2 id="rq-dados" style={{ margin: 0 }}>
            Dados
          </h2>
          {data.permissions.edit && !closed && (
            <Button variant="secondary" className="btn-sm" onClick={() => setEditing(true)}>
              Editar solicitação
            </Button>
          )}
        </div>
        <dl className="kv">
          <dt>Cliente</dt>
          <dd>
            {data.clientName}
            {data.brandName ? ` · ${data.brandName}` : ''}
          </dd>
          <dt>Tipo</dt>
          <dd>{data.typeName}</dd>
          <dt>Solicitante</dt>
          <dd>
            {data.requesterName} · {fmtTime(data.createdAt)}
          </dd>
          <dt>Descrição</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{data.description}</dd>
          <dt>Objetivo</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{data.objective ?? '—'}</dd>
          <dt>Público</dt>
          <dd>{data.audience ?? '—'}</dd>
          <dt>Rede e formato</dt>
          <dd>
            {data.network ? NETWORK_LABELS[data.network] : '—'}
            {data.format ? ` · ${data.format}` : ''}
          </dd>
          <dt>Data desejada</dt>
          <dd>{fmtDate(data.desiredDate)}</dd>
          <dt>Referências</dt>
          <dd style={{ whiteSpace: 'pre-wrap' }}>{data.referenceNotes ?? '—'}</dd>
          <dt>Prioridade</dt>
          <dd>
            {PRIORITY_LABELS[data.priority]}
            {data.priority !== data.originalPriority && (
              <span className="muted"> (original: {PRIORITY_LABELS[data.originalPriority]})</span>
            )}
            {data.urgencyReason && <span className="muted"> · {data.urgencyReason}</span>}
          </dd>
          <dt>Aprovação do cliente</dt>
          <dd>{data.approvalRequired ? 'Necessária' : 'Não necessária'}</dd>
          <dt>Responsável</dt>
          <dd>{data.assigneeName ?? 'Sem responsável'}</dd>
          <dt>Prazos</dt>
          <dd>
            Resposta até {data.firstResponseDueAt ? fmtTime(data.firstResponseDueAt) : 'sem SLA'} ·
            Entrega estimada {fmtDate(data.estimatedDue)}
          </dd>
        </dl>
        {data.convertedToId ? (
          <p>
            Convertida em <Link href={`/conteudos/${data.convertedToId}`}>conteúdo</Link>.
          </p>
        ) : canConvert && data.status === 'accepted' ? (
          <div className="actions">
            <Button onClick={convert}>Converter em conteúdo</Button>
            <span className="field-hint">
              Cria um rascunho com os dados desta solicitação (cliente, marca, título, briefing,
              data desejada e responsável).
            </span>
          </div>
        ) : (
          <p className="field-hint">
            Conversão em conteúdo: disponível quando a solicitação estiver aceita. Conversão em
            projeto ou tarefa chega na Etapa 07.
          </p>
        )}
      </section>

      {data.permissions.edit && (
        <section className="section stack" aria-labelledby="rq-acoes">
          <h2 id="rq-acoes">Triagem</h2>
          {nextStates.length === 0 ? (
            <p className="muted">Nenhuma ação de situação disponível.</p>
          ) : (
            <form onSubmit={applyStatus} className="stack" noValidate>
              <div className="form-row">
                <div className="field">
                  <label htmlFor="rq-to">Mudar situação para</label>
                  <select
                    id="rq-to"
                    className="input"
                    value={target}
                    onChange={(e) => setTarget(e.target.value as RequestStatus)}
                  >
                    <option value="">Selecione…</option>
                    {nextStates.map((s) => (
                      <option key={s} value={s}>
                        {closed && s === 'in_triage' ? 'Reabrir (em triagem)' : STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {target && (
                <div className="field">
                  <label htmlFor="rq-msg">
                    {target === 'awaiting_info'
                      ? 'Quais informações faltam? *'
                      : MESSAGE_REQUIRED.includes(target) || closed
                        ? 'Motivo *'
                        : 'Mensagem (opcional)'}
                  </label>
                  <textarea
                    id="rq-msg"
                    name="message"
                    className="input"
                    rows={3}
                    style={{ padding: 10, minHeight: 72 }}
                  />
                  {fieldError(details, 'message') && (
                    <span className="field-error">{fieldError(details, 'message')}</span>
                  )}
                </div>
              )}
              <div>
                <Button type="submit" disabled={!target}>
                  Aplicar
                </Button>
              </div>
            </form>
          )}
          {data.permissions.assign && !closed && (
            <form
              onSubmit={assign}
              className="form-row"
              noValidate
              aria-label="Responsável e prazo"
            >
              <div className="field">
                <label htmlFor="rq-as">Responsável</label>
                <select
                  id="rq-as"
                  name="assignee"
                  className="input"
                  defaultValue={data.assigneeUserId ?? ''}
                >
                  <option value="">Sem responsável</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                id="rq-due"
                name="due"
                label="Prazo estimado de entrega"
                type="date"
                defaultValue={data.estimatedDue ?? ''}
                error={fieldError(details, 'estimatedDue')}
              />
              <div>
                <Button type="submit" variant="secondary">
                  Salvar atribuição
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="section stack" aria-labelledby="rq-hist">
        <h2 id="rq-hist">Histórico e comentários</h2>
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {data.events.map((e) => (
            <li
              key={e.id}
              className={`notif ${e.internalOnly ? 'unread' : ''}`}
              style={{ borderRadius: 8, border: '1px solid var(--color-border)' }}
            >
              <div>
                <strong>{EVENT_LABELS[e.kind] ?? e.kind}</strong>{' '}
                {e.internalOnly && <Badge tone="warning">Nota interna</Badge>}
                <span className="muted">
                  {' '}
                  · {e.actorName ?? 'Sistema'} · {fmtTime(e.createdAt)}
                </span>
                {describe(e) && <div className="muted">{describe(e)}</div>}
                {e.body && <div style={{ whiteSpace: 'pre-wrap' }}>{e.body}</div>}
              </div>
            </li>
          ))}
        </ol>
        {!closed ? (
          <form onSubmit={comment} className="stack" noValidate>
            <div className="field">
              <label htmlFor="rq-body">
                {data.status === 'awaiting_info' && !data.permissions.edit
                  ? 'Responder ao pedido de informações'
                  : 'Novo comentário'}
              </label>
              <textarea
                id="rq-body"
                name="body"
                className="input"
                rows={3}
                style={{ padding: 10, minHeight: 72 }}
              />
              {fieldError(details, 'body') && (
                <span className="field-error">{fieldError(details, 'body')}</span>
              )}
            </div>
            {internal && (
              <label className="row" style={{ minHeight: 44 }}>
                <input type="checkbox" name="internalOnly" className="check" /> Nota interna (não
                aparece para o cliente)
              </label>
            )}
            <div>
              <Button type="submit" variant="secondary">
                Enviar
              </Button>
            </div>
          </form>
        ) : (
          <p className="muted">Solicitação encerrada. Reabra-a para comentar.</p>
        )}
      </section>
    </div>
  );
}
