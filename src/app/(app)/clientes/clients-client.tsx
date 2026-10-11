'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { EmptyState } from '@/ui/states';

interface Row {
  id: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function ClientsClient({ clients, canCreate }: { clients: Row[]; canCreate: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await api('POST', '/api/clients', { name: new FormData(form).get('name') });
    if (r.ok) {
      form.reset();
      setError(null);
      router.refresh();
    } else setError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao criar.');
  }
  async function rename(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await api('PATCH', `/api/clients/${id}`, {
      name: new FormData(e.currentTarget).get('name'),
    });
    if (r.ok) {
      setEditing(null);
      setError(null);
      router.refresh();
    } else setError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao renomear.');
  }
  async function remove(id: string) {
    const r = await api('DELETE', `/api/clients/${id}`);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? 'Erro ao excluir.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {canCreate && (
        <form onSubmit={create} className="section form-row" noValidate>
          <Field id="novo-cliente" name="name" label="Novo cliente" required />
          <div>
            <Button type="submit">Adicionar</Button>
          </div>
        </form>
      )}
      {clients.length === 0 ? (
        <EmptyState
          title="Nenhum cliente ainda"
          description={
            canCreate
              ? 'Adicione o primeiro cliente acima.'
              : 'Nenhum cliente disponível para o seu perfil.'
          }
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Lista de clientes" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    {editing === c.id ? (
                      <form onSubmit={(e) => rename(c.id, e)} className="row">
                        <input
                          className="input"
                          name="name"
                          defaultValue={c.name}
                          aria-label={`Novo nome de ${c.name}`}
                          required
                        />
                        <Button type="submit" className="btn-sm">
                          Salvar
                        </Button>
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => setEditing(null)}
                        >
                          Cancelar
                        </Button>
                      </form>
                    ) : (
                      c.name
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {c.canEdit && editing !== c.id && (
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => setEditing(c.id)}
                        >
                          Renomear
                        </Button>
                      )}
                      {c.canDelete && (
                        <ConfirmDialog
                          triggerLabel="Excluir"
                          title={`Excluir ${c.name}?`}
                          description="O cliente vai para a lixeira. A recuperação será disponibilizada em etapa futura; hoje só é possível por administração do banco."
                          confirmLabel="Excluir"
                          onConfirm={() => remove(c.id)}
                        />
                      )}
                    </div>
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
