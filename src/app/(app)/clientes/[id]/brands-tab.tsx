'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { fieldError, str } from '@/ui/form-utils';
import { EmptyState } from '@/ui/states';
import { NETWORK_LABELS, PROFILE_STATUS_LABELS } from '@/modules/requests/labels';

interface Profile {
  id: string;
  network: string;
  profileName: string;
  handle: string;
  url: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  status: string;
  accountType: string | null;
  notes: string | null;
  publishMode: string;
  integrationStatus: string;
  lastSyncAt: string | null;
}
interface Brand {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  description: string | null;
  objectives: string | null;
  audience: string | null;
  toneOfVoice: string | null;
  editorialGuidelines: string | null;
  profiles: Profile[];
}
type Owner = { id: string; name: string };

export function BrandsTab({
  clientId,
  brands,
  owners,
  canEdit,
  canDelete,
}: {
  clientId: string;
  brands: Brand[];
  owners: Owner[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string[]> | undefined>();
  const [editingBrand, setEditingBrand] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<{ brandId: string; profile?: Profile } | null>(
    null,
  );

  const done = () => {
    setError(null);
    setDetails(undefined);
    router.refresh();
  };
  const fail = (r: { error?: { message: string; details?: Record<string, string[]> } }) => {
    setDetails(r.error?.details);
    setError(r.error?.message ?? 'Erro.');
  };

  async function createBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const r = await api('POST', `/api/clients/${clientId}/brands`, {
      name: new FormData(form).get('name'),
    });
    if (r.ok) {
      form.reset();
      done();
    } else fail(r);
  }
  async function saveBrand(id: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api('PUT', `/api/brands/${id}`, {
      name: f.get('name'),
      status: f.get('status'),
      description: str(f, 'description'),
      objectives: str(f, 'objectives'),
      audience: str(f, 'audience'),
      toneOfVoice: str(f, 'toneOfVoice'),
      editorialGuidelines: str(f, 'editorialGuidelines'),
    });
    if (r.ok) {
      setEditingBrand(null);
      done();
    } else fail(r);
  }
  async function saveProfile(
    brandId: string,
    profile: Profile | undefined,
    e: React.FormEvent<HTMLFormElement>,
  ) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      network: f.get('network'),
      profileName: f.get('profileName'),
      handle: f.get('handle'),
      url: str(f, 'url'),
      ownerUserId: str(f, 'ownerUserId'),
      status: f.get('status'),
      accountType: str(f, 'accountType'),
      notes: str(f, 'notes'),
    };
    const r = profile
      ? await api('PUT', `/api/social-profiles/${profile.id}`, body)
      : await api('POST', `/api/brands/${brandId}/profiles`, body);
    if (r.ok) {
      setProfileForm(null);
      done();
    } else fail(r);
  }
  async function del(url: string) {
    const r = await api('DELETE', url);
    if (r.ok) done();
    else fail(r);
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <Alert tone="info">
        Os perfis são cadastrados manualmente. A conexão oficial com as redes (publicação e métricas
        por API) é uma etapa posterior e hoje todos aparecem como “não conectado”.
      </Alert>
      {canEdit && (
        <form onSubmit={createBrand} className="section form-row" noValidate>
          <Field
            id="nova-marca"
            name="name"
            label="Nova marca"
            required
            error={fieldError(details, 'name')}
          />
          <div>
            <Button type="submit">Adicionar marca</Button>
          </div>
        </form>
      )}
      {brands.length === 0 && (
        <EmptyState
          title="Nenhuma marca cadastrada"
          description="Cada cliente pode ter várias marcas, cada uma com seus perfis sociais e diretrizes."
        />
      )}
      {brands.map((b) => (
        <section key={b.id} className="section stack" aria-labelledby={`b-${b.id}`}>
          <div className="page-head" style={{ marginBottom: 0 }}>
            <h2 id={`b-${b.id}`} style={{ margin: 0 }}>
              {b.name} {b.status === 'inactive' && <Badge>Inativa</Badge>}
            </h2>
            <div className="actions">
              {canEdit && (
                <Button
                  variant="secondary"
                  className="btn-sm"
                  onClick={() => setEditingBrand(editingBrand === b.id ? null : b.id)}
                >
                  {editingBrand === b.id ? 'Fechar edição' : 'Editar marca'}
                </Button>
              )}
              {canDelete && (
                <ConfirmDialog
                  triggerLabel="Excluir marca"
                  title={`Excluir ${b.name}?`}
                  description="A marca e seus perfis vão para a lixeira."
                  confirmLabel="Excluir"
                  onConfirm={() => del(`/api/brands/${b.id}`)}
                />
              )}
            </div>
          </div>
          {editingBrand === b.id ? (
            <form onSubmit={(e) => saveBrand(b.id, e)} className="stack" noValidate>
              <div className="form-row">
                <Field
                  id={`bn-${b.id}`}
                  name="name"
                  label="Nome"
                  defaultValue={b.name}
                  required
                  error={fieldError(details, 'name')}
                />
                <div className="field">
                  <label htmlFor={`bs-${b.id}`}>Situação</label>
                  <select id={`bs-${b.id}`} name="status" className="input" defaultValue={b.status}>
                    <option value="active">Ativa</option>
                    <option value="inactive">Inativa</option>
                  </select>
                </div>
              </div>
              {(
                [
                  ['description', 'Descrição'],
                  ['objectives', 'Objetivos'],
                  ['audience', 'Público'],
                  ['toneOfVoice', 'Tom de voz'],
                  ['editorialGuidelines', 'Diretrizes editoriais'],
                ] as const
              ).map(([k, label]) => (
                <div className="field" key={k}>
                  <label htmlFor={`b${k}-${b.id}`}>{label}</label>
                  <textarea
                    id={`b${k}-${b.id}`}
                    name={k}
                    className="input"
                    rows={2}
                    style={{ padding: 10, minHeight: 64 }}
                    defaultValue={b[k] ?? ''}
                  />
                </div>
              ))}
              <div>
                <Button type="submit">Salvar marca</Button>
              </div>
            </form>
          ) : (
            <dl className="kv muted">
              {b.toneOfVoice && (
                <>
                  <dt>Tom de voz</dt>
                  <dd>{b.toneOfVoice}</dd>
                </>
              )}
              {b.audience && (
                <>
                  <dt>Público</dt>
                  <dd>{b.audience}</dd>
                </>
              )}
              {b.description && (
                <>
                  <dt>Descrição</dt>
                  <dd>{b.description}</dd>
                </>
              )}
            </dl>
          )}

          <h3>Perfis sociais</h3>
          {b.profiles.length === 0 ? (
            <p className="muted">Nenhum perfil cadastrado.</p>
          ) : (
            <div
              className="table-wrap"
              role="region"
              aria-label={`Perfis de ${b.name}`}
              tabIndex={0}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Rede</th>
                    <th scope="col">Perfil</th>
                    <th scope="col" className="hide-mobile">
                      Responsável
                    </th>
                    <th scope="col">Situação</th>
                    <th scope="col">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {b.profiles.map((p) => (
                    <tr key={p.id}>
                      <td>{NETWORK_LABELS[p.network]}</td>
                      <td>
                        <strong>{p.profileName}</strong>
                        <br />
                        <span className="muted">@{p.handle}</span>
                        <br />
                        <Badge>Publicação manual · não conectado</Badge>
                      </td>
                      <td className="hide-mobile">{p.ownerName ?? '—'}</td>
                      <td>
                        <Badge tone={p.status === 'active' ? 'success' : 'neutral'}>
                          {PROFILE_STATUS_LABELS[p.status]}
                        </Badge>
                      </td>
                      <td>
                        <div className="actions">
                          {canEdit && (
                            <Button
                              variant="secondary"
                              className="btn-sm"
                              onClick={() => setProfileForm({ brandId: b.id, profile: p })}
                            >
                              Editar
                            </Button>
                          )}
                          {canDelete && (
                            <ConfirmDialog
                              triggerLabel="Excluir"
                              title={`Excluir o perfil @${p.handle}?`}
                              description="O perfil vai para a lixeira."
                              confirmLabel="Excluir"
                              onConfirm={() => del(`/api/social-profiles/${p.id}`)}
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
          {canEdit && profileForm?.brandId !== b.id && (
            <div>
              <Button
                variant="secondary"
                className="btn-sm"
                onClick={() => setProfileForm({ brandId: b.id })}
              >
                Adicionar perfil social
              </Button>
            </div>
          )}
          {canEdit && profileForm?.brandId === b.id && (
            <form
              key={profileForm.profile?.id ?? 'novo'}
              onSubmit={(e) => saveProfile(b.id, profileForm.profile, e)}
              className="section stack"
              noValidate
              aria-label={profileForm.profile ? 'Editar perfil' : 'Novo perfil'}
            >
              <h3>{profileForm.profile ? 'Editar perfil' : 'Novo perfil'}</h3>
              <div className="form-row">
                <div className="field">
                  <label htmlFor={`pn-${b.id}`}>Rede social</label>
                  <select
                    id={`pn-${b.id}`}
                    name="network"
                    className="input"
                    defaultValue={profileForm.profile?.network ?? 'instagram'}
                  >
                    {Object.entries(NETWORK_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  id={`pnm-${b.id}`}
                  name="profileName"
                  label="Nome do perfil"
                  defaultValue={profileForm.profile?.profileName ?? ''}
                  required
                  error={fieldError(details, 'profileName')}
                />
                <Field
                  id={`ph-${b.id}`}
                  name="handle"
                  label="Identificador (@)"
                  defaultValue={profileForm.profile?.handle ?? ''}
                  required
                  error={fieldError(details, 'handle')}
                />
                <Field
                  id={`pu-${b.id}`}
                  name="url"
                  label="URL"
                  defaultValue={profileForm.profile?.url ?? ''}
                  error={fieldError(details, 'url')}
                />
                <div className="field">
                  <label htmlFor={`po-${b.id}`}>Responsável interno</label>
                  <select
                    id={`po-${b.id}`}
                    name="ownerUserId"
                    className="input"
                    defaultValue={profileForm.profile?.ownerUserId ?? ''}
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
                  <label htmlFor={`ps-${b.id}`}>Situação</label>
                  <select
                    id={`ps-${b.id}`}
                    name="status"
                    className="input"
                    defaultValue={profileForm.profile?.status ?? 'active'}
                  >
                    {Object.entries(PROFILE_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  id={`pt-${b.id}`}
                  name="accountType"
                  label="Tipo de conta"
                  defaultValue={profileForm.profile?.accountType ?? ''}
                  hint="Ex.: comercial, criador, página."
                />
                <Field
                  id={`pno-${b.id}`}
                  name="notes"
                  label="Observações"
                  defaultValue={profileForm.profile?.notes ?? ''}
                />
              </div>
              <div className="actions">
                <Button type="submit">Salvar perfil</Button>
                <Button variant="secondary" onClick={() => setProfileForm(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          )}
        </section>
      ))}
    </div>
  );
}
