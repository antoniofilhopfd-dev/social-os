'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { fieldError, str } from '@/ui/form-utils';
import { APPROVAL_FLOW_LABELS } from '@/modules/requests/labels';

interface Client {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  ownerUserId: string | null;
  objectives: string | null;
  audience: string | null;
  toneOfVoice: string | null;
  editorialGuidelines: string | null;
  languageRestrictions: string | null;
  allowedTopics: string | null;
  forbiddenTopics: string | null;
  visualIdentity: string | null;
  recurringInfo: string | null;
  internalNotes: string | null;
  approvalFlow: string;
  slaResponseHours: number | null;
  slaDeliveryDays: number | null;
}

const TEXT_FIELDS: [keyof Client, string, string][] = [
  ['objectives', 'Objetivos de comunicação', 'O que o cliente quer alcançar nas redes.'],
  ['audience', 'Público-alvo', 'Quem queremos atingir.'],
  ['toneOfVoice', 'Tom de voz', 'Como a marca fala (ex.: descontraído, técnico).'],
  [
    'editorialGuidelines',
    'Diretrizes editoriais',
    'Regras de conteúdo, pilares, formatos preferidos.',
  ],
  ['languageRestrictions', 'Restrições de linguagem', 'Palavras ou construções a evitar.'],
  ['allowedTopics', 'Temas permitidos', ''],
  ['forbiddenTopics', 'Temas proibidos', ''],
  [
    'visualIdentity',
    'Identidade visual',
    'Cores, fontes e links de referência. Arquivos entram na Biblioteca (Etapa 06).',
  ],
  [
    'recurringInfo',
    'Informações recorrentes',
    'Produtos, serviços, horários, endereços usados com frequência.',
  ],
];

export function GeneralTab({
  client,
  owners,
  canEdit,
  canDelete,
  showInternalNotes,
}: {
  client: Client;
  owners: { id: string; name: string }[];
  canEdit: boolean;
  canDelete: boolean;
  showInternalNotes: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => (str(f, k) ? Number(str(f, k)) : null);
    const body: Record<string, unknown> = {
      name: f.get('name'),
      status: f.get('status'),
      ownerUserId: str(f, 'ownerUserId'),
      approvalFlow: f.get('approvalFlow'),
      slaResponseHours: num('slaResponseHours'),
      slaDeliveryDays: num('slaDeliveryDays'),
    };
    for (const [k] of TEXT_FIELDS) body[k] = str(f, k as string);
    if (showInternalNotes) body.internalNotes = str(f, 'internalNotes');
    const r = await api('PATCH', `/api/clients/${client.id}`, body);
    if (r.ok) {
      setError(null);
      setDetails(undefined);
      setSaved(true);
      router.refresh();
    } else {
      setSaved(false);
      setDetails(r.error?.details);
      setError(r.error?.message ?? 'Erro ao salvar.');
    }
  }

  async function remove() {
    const r = await api('DELETE', `/api/clients/${client.id}`);
    if (r.ok) router.push('/clientes');
    else setError(r.error?.message ?? 'Erro ao excluir.');
  }

  return (
    <form onSubmit={save} className="stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Alterações salvas.</Alert>}
      <fieldset className="section stack" disabled={!canEdit} style={{ margin: 0 }}>
        <legend className="sr-only">Dados básicos</legend>
        <h2>Dados básicos</h2>
        <div className="form-row">
          <Field
            id="c-name"
            name="name"
            label="Nome"
            defaultValue={client.name}
            error={fieldError(details, 'name')}
            required
          />
          <div className="field">
            <label htmlFor="c-status">Situação</label>
            <select id="c-status" name="status" className="input" defaultValue={client.status}>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-owner">Responsável interno</label>
            <select
              id="c-owner"
              name="ownerUserId"
              className="input"
              defaultValue={client.ownerUserId ?? ''}
            >
              <option value="">Sem responsável</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="c-flow">Fluxo de aprovação</label>
            <select
              id="c-flow"
              name="approvalFlow"
              className="input"
              defaultValue={client.approvalFlow}
            >
              {Object.entries(APPROVAL_FLOW_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="c-sla-r"
            name="slaResponseHours"
            label="SLA de primeira resposta (horas)"
            type="number"
            min={1}
            max={720}
            defaultValue={client.slaResponseHours ?? ''}
            error={fieldError(details, 'slaResponseHours')}
            hint="Prazo para a equipe responder uma nova solicitação."
          />
          <Field
            id="c-sla-d"
            name="slaDeliveryDays"
            label="Prazo de entrega (dias)"
            type="number"
            min={1}
            max={365}
            defaultValue={client.slaDeliveryDays ?? ''}
            error={fieldError(details, 'slaDeliveryDays')}
          />
        </div>
      </fieldset>

      <fieldset className="section stack" disabled={!canEdit} style={{ margin: 0 }}>
        <legend className="sr-only">Diretrizes editoriais</legend>
        <h2>Comunicação e diretrizes</h2>
        {TEXT_FIELDS.map(([k, label, hint]) => (
          <div className="field" key={k}>
            <label htmlFor={`c-${k}`}>{label}</label>
            <textarea
              id={`c-${k}`}
              name={k}
              className="input"
              rows={3}
              style={{ padding: 10, minHeight: 80 }}
              defaultValue={(client[k] as string | null) ?? ''}
              aria-describedby={hint ? `c-${k}-h` : undefined}
            />
            {hint && (
              <span id={`c-${k}-h`} className="field-hint">
                {hint}
              </span>
            )}
            {fieldError(details, k as string) && (
              <span className="field-error">{fieldError(details, k as string)}</span>
            )}
          </div>
        ))}
        {showInternalNotes && (
          <div className="field">
            <label htmlFor="c-internalNotes">Observações internas</label>
            <textarea
              id="c-internalNotes"
              name="internalNotes"
              className="input"
              rows={3}
              style={{ padding: 10, minHeight: 80 }}
              defaultValue={client.internalNotes ?? ''}
              aria-describedby="c-internalNotes-h"
            />
            <span id="c-internalNotes-h" className="field-hint">
              Visível só para a equipe interna. Nunca aparece no portal do cliente.
            </span>
          </div>
        )}
      </fieldset>

      {canEdit && (
        <div className="actions">
          <Button type="submit">Salvar alterações</Button>
          {canDelete && (
            <ConfirmDialog
              triggerLabel="Excluir cliente"
              title={`Excluir ${client.name}?`}
              description="O cliente vai para a lixeira. A recuperação será disponibilizada em etapa futura."
              confirmLabel="Excluir"
              onConfirm={remove}
            />
          )}
        </div>
      )}
    </form>
  );
}
