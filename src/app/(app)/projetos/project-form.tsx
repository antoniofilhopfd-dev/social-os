'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Field } from '@/ui/components';
import { fieldError, str } from '@/ui/form-utils';
import { PROJECT_STATUS_LABELS } from '@/modules/tasks/rules';

export interface ProjectInitial {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  ownerUserId: string | null;
}

export function ProjectForm(props: {
  mode: 'create' | 'edit';
  clients: { id: string; name: string }[];
  assignees: { id: string; name: string }[];
  prefillClientId?: string;
  initial?: ProjectInitial;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [saved, setSaved] = useState(false);
  const edit = props.mode === 'edit';
  const e = (k: string) => fieldError(details, k);
  const i = props.initial;

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const body: Record<string, unknown> = {
      name: String(f.get('name') ?? ''),
      description: str(f, 'description'),
      status: String(f.get('status') ?? 'planning'),
      startDate: str(f, 'startDate'),
      dueDate: str(f, 'dueDate'),
      ownerUserId: str(f, 'ownerUserId'),
    };
    if (!edit) body.clientId = String(f.get('clientId') ?? '');
    const r = edit
      ? await api('PATCH', `/api/projects/${i!.id}`, body)
      : await api<{ id: string }>('POST', '/api/projects', body);
    if (r.ok) {
      setError(null);
      setDetails(undefined);
      if (!edit) router.push(`/projetos/${(r.data as { id: string }).id}`);
      else {
        setSaved(true);
        router.refresh();
      }
    } else {
      setSaved(false);
      setDetails(r.error?.details);
      setError(r.error?.message ?? 'Não foi possível salvar.');
    }
  }
  return (
    <form onSubmit={submit} className="section stack" noValidate aria-label="Dados do projeto">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Alterações salvas.</Alert>}
      <Field
        id="pj-name"
        name="name"
        label="Nome *"
        defaultValue={i?.name ?? ''}
        error={e('name')}
        maxLength={190}
      />
      {!edit && (
        <div className="field">
          <label htmlFor="pj-client">Cliente *</label>
          <select
            id="pj-client"
            name="clientId"
            className="input"
            defaultValue={props.prefillClientId ?? props.clients[0]?.id}
          >
            {props.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="pj-desc">Descrição</label>
        <textarea
          id="pj-desc"
          name="description"
          className="input"
          rows={4}
          style={{ padding: 10 }}
          defaultValue={i?.description ?? ''}
        />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="pj-status">Situação</label>
          <select
            id="pj-status"
            name="status"
            className="input"
            defaultValue={i?.status ?? 'planning'}
          >
            {Object.entries(PROJECT_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="pj-start"
          name="startDate"
          type="date"
          label="Início"
          defaultValue={i?.startDate ?? ''}
          error={e('startDate')}
        />
        <Field
          id="pj-due"
          name="dueDate"
          type="date"
          label="Prazo"
          defaultValue={i?.dueDate ?? ''}
          error={e('dueDate')}
        />
        <div className="field">
          <label htmlFor="pj-owner">Responsável</label>
          <select
            id="pj-owner"
            name="ownerUserId"
            className="input"
            defaultValue={i?.ownerUserId ?? ''}
          >
            <option value="">Sem responsável</option>
            {props.assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-primary">
          {edit ? 'Salvar alterações' : 'Criar projeto'}
        </button>
      </div>
    </form>
  );
}
