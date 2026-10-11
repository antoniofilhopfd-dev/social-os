'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Field } from '@/ui/components';
import { fieldError, str } from '@/ui/form-utils';
import { PRIORITY_LABELS } from '@/modules/requests/rules';

export interface TaskInitial {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  assigneeUserId: string | null;
  projectId: string | null;
}

export function TaskForm(props: {
  mode: 'create' | 'edit';
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  assignees: { id: string; name: string }[];
  canAssign: boolean;
  meId: string;
  canOrgWide: boolean;
  initial?: TaskInitial;
  prefill?: { clientId?: string; projectId?: string; contentId?: string };
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(
    props.prefill?.clientId ?? (props.canOrgWide ? '' : (props.clients[0]?.id ?? '')),
  );
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [saved, setSaved] = useState(false);
  const edit = props.mode === 'edit';
  const e = (k: string) => fieldError(details, k);
  const projects = props.projects.filter((p) => !clientId || p.clientId === clientId);

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const body: Record<string, unknown> = {
      title: String(f.get('title') ?? ''),
      description: str(f, 'description'),
      priority: String(f.get('priority') ?? 'normal'),
      dueDate: str(f, 'dueDate'),
      projectId: str(f, 'projectId'),
    };
    if (props.canAssign || !edit) body.assigneeUserId = str(f, 'assigneeUserId');
    if (!edit) {
      body.clientId = clientId || null;
      if (props.prefill?.contentId) body.contentId = props.prefill.contentId;
    }
    const r = edit
      ? await api('PATCH', `/api/tasks/${props.initial!.id}`, body)
      : await api<{ id: string }>('POST', '/api/tasks', body);
    if (r.ok) {
      setError(null);
      setDetails(undefined);
      if (!edit) router.push(`/tarefas/${(r.data as { id: string }).id}`);
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

  const i = props.initial;
  return (
    <form onSubmit={submit} className="section stack" noValidate aria-label="Dados da tarefa">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Alterações salvas.</Alert>}
      <Field
        id="tk-title"
        name="title"
        label="Título *"
        defaultValue={i?.title ?? ''}
        error={e('title')}
        maxLength={190}
      />
      <div className="field">
        <label htmlFor="tk-desc">Descrição</label>
        <textarea
          id="tk-desc"
          name="description"
          className="input"
          rows={4}
          style={{ padding: 10 }}
          defaultValue={i?.description ?? ''}
        />
      </div>
      {!edit && !props.prefill?.contentId && (
        <div className="field">
          <label htmlFor="tk-client">Cliente</label>
          <select
            id="tk-client"
            className="input"
            value={clientId}
            onChange={(ev) => setClientId(ev.target.value)}
          >
            {props.canOrgWide && <option value="">Interna (sem cliente)</option>}
            {props.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!props.prefill?.contentId && (
        <div className="field">
          <label htmlFor="tk-project">Projeto</label>
          <select
            id="tk-project"
            name="projectId"
            className="input"
            defaultValue={i?.projectId ?? props.prefill?.projectId ?? ''}
          >
            <option value="">Sem projeto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {e('projectId') && <span className="field-error">{e('projectId')}</span>}
        </div>
      )}
      <div className="form-row">
        <div className="field">
          <label htmlFor="tk-prio">Prioridade</label>
          <select
            id="tk-prio"
            name="priority"
            className="input"
            defaultValue={i?.priority ?? 'normal'}
          >
            {Object.entries(PRIORITY_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="tk-due"
          name="dueDate"
          type="date"
          label="Prazo"
          defaultValue={i?.dueDate ?? ''}
          error={e('dueDate')}
        />
        <div className="field">
          <label htmlFor="tk-assignee">Responsável</label>
          <select
            id="tk-assignee"
            name="assigneeUserId"
            className="input"
            defaultValue={i?.assigneeUserId ?? ''}
            disabled={!props.canAssign && edit}
          >
            <option value="">Sem responsável</option>
            {props.assignees
              .filter((a) => props.canAssign || a.id === props.meId)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
          {e('assigneeUserId') && <span className="field-error">{e('assigneeUserId')}</span>}
        </div>
      </div>
      <div>
        <button type="submit" className="btn btn-primary">
          {edit ? 'Salvar alterações' : 'Criar tarefa'}
        </button>
      </div>
    </form>
  );
}
