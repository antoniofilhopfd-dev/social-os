'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { fieldError, str } from '@/ui/form-utils';
import { EmptyState } from '@/ui/states';

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'inactive';
}
const fmt = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export function CampaignsTab({
  clientId,
  campaigns,
  canEdit,
  canDelete,
}: {
  clientId: string;
  campaigns: Campaign[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [editing, setEditing] = useState<string | null>(null);

  const body = (f: FormData) => ({
    name: f.get('name'),
    description: str(f, 'description'),
    startDate: str(f, 'startDate'),
    endDate: str(f, 'endDate'),
    status: f.get('status') ?? 'active',
  });
  const done = () => {
    setError(null);
    setDetails(undefined);
    setEditing(null);
    router.refresh();
  };
  const fail = (r: { error?: { message: string; details?: Record<string, string[]> } }) => {
    setDetails(r.error?.details);
    setError(r.error?.message ?? 'Erro.');
  };

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await api('POST', `/api/clients/${clientId}/campaigns`, body(new FormData(form)));
    if (r.ok) {
      form.reset();
      done();
    } else fail(r);
  }
  async function save(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await api('PUT', `/api/campaigns/${id}`, body(new FormData(e.currentTarget)));
    if (r.ok) done();
    else fail(r);
  }
  async function remove(id: string) {
    const r = await api('DELETE', `/api/campaigns/${id}`);
    if (r.ok) done();
    else fail(r);
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {canEdit && (
        <form onSubmit={create} className="section stack" noValidate>
          <h2>Nova campanha editorial</h2>
          <div className="form-row">
            <Field
              id="cp-name"
              name="name"
              label="Nome"
              required
              error={fieldError(details, 'name')}
            />
            <Field
              id="cp-start"
              name="startDate"
              label="Início"
              type="date"
              error={fieldError(details, 'startDate')}
            />
            <Field
              id="cp-end"
              name="endDate"
              label="Fim"
              type="date"
              error={fieldError(details, 'endDate')}
            />
          </div>
          <Field id="cp-desc" name="description" label="Descrição" />
          <div>
            <Button type="submit">Adicionar campanha</Button>
          </div>
        </form>
      )}
      {campaigns.length === 0 ? (
        <EmptyState
          title="Nenhuma campanha cadastrada"
          description="Campanhas agrupam conteúdos orgânicos com um mesmo objetivo e período."
        />
      ) : (
        campaigns.map((c) => (
          <section key={c.id} className="section stack" aria-labelledby={`cp-${c.id}`}>
            <div className="page-head" style={{ marginBottom: 0 }}>
              <h2 id={`cp-${c.id}`} style={{ margin: 0 }}>
                {c.name} {c.status === 'inactive' && <Badge>Inativa</Badge>}
              </h2>
              <div className="actions">
                {canEdit && (
                  <Button
                    variant="secondary"
                    className="btn-sm"
                    onClick={() => setEditing(editing === c.id ? null : c.id)}
                  >
                    {editing === c.id ? 'Fechar' : 'Editar'}
                  </Button>
                )}
                {canDelete && (
                  <ConfirmDialog
                    triggerLabel="Excluir"
                    title={`Excluir ${c.name}?`}
                    description="Os conteúdos permanecem, mas deixam de pertencer a esta campanha."
                    confirmLabel="Excluir"
                    onConfirm={() => remove(c.id)}
                  />
                )}
              </div>
            </div>
            {editing === c.id ? (
              <form onSubmit={(e) => save(c.id, e)} className="stack" noValidate>
                <div className="form-row">
                  <Field
                    id={`cn-${c.id}`}
                    name="name"
                    label="Nome"
                    defaultValue={c.name}
                    required
                    error={fieldError(details, 'name')}
                  />
                  <Field
                    id={`cs-${c.id}`}
                    name="startDate"
                    label="Início"
                    type="date"
                    defaultValue={c.startDate ?? ''}
                  />
                  <Field
                    id={`ce-${c.id}`}
                    name="endDate"
                    label="Fim"
                    type="date"
                    defaultValue={c.endDate ?? ''}
                    error={fieldError(details, 'endDate')}
                  />
                  <div className="field">
                    <label htmlFor={`cst-${c.id}`}>Situação</label>
                    <select
                      id={`cst-${c.id}`}
                      name="status"
                      className="input"
                      defaultValue={c.status}
                    >
                      <option value="active">Ativa</option>
                      <option value="inactive">Inativa</option>
                    </select>
                  </div>
                </div>
                <Field
                  id={`cd-${c.id}`}
                  name="description"
                  label="Descrição"
                  defaultValue={c.description ?? ''}
                />
                <div>
                  <Button type="submit">Salvar campanha</Button>
                </div>
              </form>
            ) : (
              <p className="muted">
                {fmt(c.startDate)} a {fmt(c.endDate)}
                {c.description ? ` · ${c.description}` : ''}
              </p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
