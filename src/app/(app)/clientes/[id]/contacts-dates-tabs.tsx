'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { fieldError, str } from '@/ui/form-utils';
import { EmptyState } from '@/ui/states';

interface Contact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  isPrimary: number;
}
interface DateRow {
  id: string;
  label: string;
  eventDate: string;
  yearly: boolean;
  note: string | null;
}

export function ContactsTab({
  clientId,
  contacts,
  canEdit,
}: {
  clientId: string;
  contacts: Contact[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api('POST', `/api/clients/${clientId}/contacts`, {
      name: f.get('name'),
      email: str(f, 'email'),
      phone: str(f, 'phone'),
      roleTitle: str(f, 'roleTitle'),
      isPrimary: f.get('isPrimary') === 'on',
    });
    if (r.ok) {
      form.reset();
      setError(null);
      setDetails(undefined);
      router.refresh();
    } else {
      setDetails(r.error?.details);
      setError(r.error?.message ?? 'Erro ao salvar.');
    }
  }
  async function remove(id: string) {
    const r = await api('DELETE', `/api/clients/${clientId}/contacts/${id}`);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? 'Erro ao remover.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {canEdit && (
        <form onSubmit={add} className="section stack" noValidate>
          <h2>Novo contato</h2>
          <div className="form-row">
            <Field
              id="ct-name"
              name="name"
              label="Nome"
              required
              error={fieldError(details, 'name')}
            />
            <Field
              id="ct-email"
              name="email"
              label="E-mail"
              type="email"
              error={fieldError(details, 'email')}
            />
            <Field id="ct-phone" name="phone" label="Telefone" />
            <Field id="ct-role" name="roleTitle" label="Cargo" />
          </div>
          <label className="row" style={{ minHeight: 44 }}>
            <input type="checkbox" name="isPrimary" className="check" /> Contato principal
          </label>
          <div>
            <Button type="submit">Adicionar contato</Button>
          </div>
        </form>
      )}
      {contacts.length === 0 ? (
        <EmptyState
          title="Nenhum contato cadastrado"
          description="Registre as pessoas do cliente que participam das aprovações e solicitações."
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Contatos do cliente" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">E-mail</th>
                <th scope="col" className="hide-mobile">
                  Telefone
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>{' '}
                    {c.isPrimary === 1 && <Badge tone="info">Principal</Badge>}
                    <br />
                    <span className="muted">{c.roleTitle ?? ''}</span>
                  </td>
                  <td>{c.email ?? '—'}</td>
                  <td className="hide-mobile">{c.phone ?? '—'}</td>
                  <td>
                    {canEdit && (
                      <ConfirmDialog
                        triggerLabel="Remover"
                        title={`Remover ${c.name}?`}
                        description="O contato será excluído do cadastro do cliente."
                        confirmLabel="Remover"
                        onConfirm={() => remove(c.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function DatesTab({
  clientId,
  dates,
  canEdit,
}: {
  clientId: string;
  dates: DateRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api('POST', `/api/clients/${clientId}/dates`, {
      label: f.get('label'),
      eventDate: f.get('eventDate'),
      yearly: f.get('yearly') === 'on',
      note: str(f, 'note'),
    });
    if (r.ok) {
      form.reset();
      setError(null);
      setDetails(undefined);
      router.refresh();
    } else {
      setDetails(r.error?.details);
      setError(r.error?.message ?? 'Erro ao salvar.');
    }
  }
  async function remove(id: string) {
    const r = await api('DELETE', `/api/clients/${clientId}/dates/${id}`);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? 'Erro ao remover.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {canEdit && (
        <form onSubmit={add} className="section stack" noValidate>
          <h2>Nova data</h2>
          <div className="form-row">
            <Field
              id="dt-label"
              name="label"
              label="Descrição"
              required
              error={fieldError(details, 'label')}
            />
            <Field
              id="dt-date"
              name="eventDate"
              label="Data"
              type="date"
              required
              error={fieldError(details, 'eventDate')}
            />
            <Field id="dt-note" name="note" label="Observação" />
          </div>
          <label className="row" style={{ minHeight: 44 }}>
            <input type="checkbox" name="yearly" className="check" defaultChecked /> Repete todos os
            anos
          </label>
          <div>
            <Button type="submit">Adicionar data</Button>
          </div>
        </form>
      )}
      {dates.length === 0 ? (
        <EmptyState
          title="Nenhuma data cadastrada"
          description="Aniversários, lançamentos e datas sazonais ajudam no planejamento."
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Datas importantes" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Descrição</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {dates.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.eventDate.split('-').reverse().join('/')} {d.yearly && <Badge>Anual</Badge>}
                  </td>
                  <td>
                    <strong>{d.label}</strong>
                    {d.note && (
                      <>
                        <br />
                        <span className="muted">{d.note}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {canEdit && (
                      <ConfirmDialog
                        triggerLabel="Remover"
                        title="Remover data?"
                        description={d.label}
                        confirmLabel="Remover"
                        onConfirm={() => remove(d.id)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
