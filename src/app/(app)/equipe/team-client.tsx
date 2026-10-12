'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';
import { EmptyState } from '@/ui/states';

interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  kind: 'internal' | 'external';
  status: string;
  roleId: string;
  roleName: string;
  scopeType: 'organization' | 'client';
  clientName: string | null;
  lastLoginAt: string | null;
  twoFactor: boolean;
}
interface Invitation {
  id: string;
  email: string;
  name: string;
  roleName: string;
  expiresAt: string;
}
interface Role {
  id: string;
  name: string;
  kind: 'internal' | 'external';
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function TeamClient(props: {
  meId: string;
  members: Member[];
  invitations: Invitation[];
  roles: Role[];
  clients: { id: string; name: string }[];
  can: { invite: boolean; edit: boolean; remove: boolean; reset: boolean; revokeInvite: boolean };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ label: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [roleId, setRoleId] = useState(props.roles[0]?.id ?? '');
  const selectedRole = props.roles.find((r) => r.id === roleId);

  async function invite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api<{ link: string }>('POST', '/api/team/invitations', {
      email: f.get('email'),
      name: f.get('name'),
      roleId: f.get('roleId'),
      clientId: f.get('clientId') || null,
    });
    if (r.ok) {
      setError(null);
      setCopied(false);
      setLink({ label: `Link de convite para ${f.get('email')}`, url: r.data!.link });
      form.reset();
      setRoleId(props.roles[0]?.id ?? '');
      router.refresh();
    } else
      setError(
        Object.values(r.error?.details ?? {})[0]?.[0] ?? r.error?.message ?? 'Erro ao convidar.',
      );
  }
  async function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    const r = await fn();
    if (r.ok) {
      setError(null);
      router.refresh();
    } else setError(r.error?.message ?? 'Erro.');
  }
  async function resetLink(m: Member) {
    const r = await api<{ link: string }>('POST', `/api/team/users/${m.userId}/reset-link`);
    if (r.ok) {
      setError(null);
      setCopied(false);
      setLink({ label: `Link de nova senha para ${m.email}`, url: r.data!.link });
    } else setError(r.error?.message ?? 'Erro ao gerar o link.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {link && (
        <section className="section" aria-labelledby="link-titulo">
          <h2 id="link-titulo">{link.label}</h2>
          <p className="muted">
            Copie e envie à pessoa por um canal seguro. Este link só é exibido agora e não pode ser
            recuperado depois.
          </p>
          <div className="linkbox" data-testid="generated-link">
            {link.url}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(link.url).catch(() => undefined);
                setCopied(true);
              }}
            >
              Copiar link
            </Button>
            <Button variant="secondary" onClick={() => setLink(null)}>
              Fechar
            </Button>
            {copied && (
              <span role="status" className="muted">
                Copiado.
              </span>
            )}
          </div>
        </section>
      )}

      {props.can.invite && (
        <section className="section" aria-labelledby="convidar">
          <h2 id="convidar">Convidar pessoa</h2>
          <form onSubmit={invite} className="form-row" noValidate>
            <Field id="inv-nome" name="name" label="Nome" required />
            <Field id="inv-email" name="email" label="E-mail" type="email" required />
            <div className="field">
              <label htmlFor="inv-role">Função</label>
              <select
                id="inv-role"
                name="roleId"
                className="input"
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                required
              >
                {props.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.kind === 'external' ? ' (externa)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="inv-client">
                Cliente{selectedRole?.kind === 'external' ? ' (obrigatório)' : ' (opcional)'}
              </label>
              <select
                id="inv-client"
                name="clientId"
                className="input"
                required={selectedRole?.kind === 'external'}
              >
                <option value="">
                  {selectedRole?.kind === 'external' ? 'Selecione' : 'Toda a organização'}
                </option>
                {props.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Button type="submit" disabled={!props.roles.length}>
                Gerar convite
              </Button>
            </div>
          </form>
          {!props.roles.length && (
            <p className="field-hint">
              Seu perfil não pode listar funções; peça a um administrador.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="membros">
        <h2 id="membros">Membros</h2>
        <div className="table-wrap" role="region" aria-label="Membros da organização" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Pessoa</th>
                <th scope="col">Função</th>
                <th scope="col">Escopo</th>
                <th scope="col" className="hide-mobile">
                  Último acesso
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.members.map((m) => (
                <tr key={m.membershipId}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.kind === 'external' && (
                      <>
                        {' '}
                        <Badge tone="info">Externo</Badge>
                      </>
                    )}
                    <br />
                    <span className="muted">{m.email}</span>
                  </td>
                  <td>
                    {props.can.edit && m.userId !== props.meId ? (
                      <select
                        className="input"
                        aria-label={`Função de ${m.name}`}
                        value={m.roleId}
                        onChange={(e) =>
                          act(() =>
                            api('PATCH', `/api/team/members/${m.membershipId}`, {
                              roleId: e.target.value,
                            }),
                          )
                        }
                      >
                        {props.roles
                          .filter((r) => r.kind === m.kind)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      m.roleName
                    )}
                  </td>
                  <td>{m.scopeType === 'client' ? m.clientName : 'Organização'}</td>
                  <td className="hide-mobile">{m.lastLoginAt ? fmt(m.lastLoginAt) : 'Nunca'}</td>
                  <td>
                    <div className="actions">
                      {props.can.reset && m.userId !== props.meId && (
                        <Button variant="secondary" className="btn-sm" onClick={() => resetLink(m)}>
                          Link de nova senha
                        </Button>
                      )}
                      {props.can.reset && m.userId !== props.meId && m.twoFactor && (
                        <ConfirmDialog
                          triggerLabel="Remover 2FA"
                          title={`Remover o 2FA de ${m.name}?`}
                          description="Use quando a pessoa perdeu o aparelho e os códigos de recuperação. As sessões dela são encerradas e ela deverá ativar o 2FA novamente."
                          confirmLabel="Remover 2FA"
                          onConfirm={() =>
                            act(() => api('POST', `/api/team/users/${m.userId}/reset-2fa`))
                          }
                        />
                      )}
                      {props.can.remove && m.userId !== props.meId && (
                        <ConfirmDialog
                          triggerLabel="Remover"
                          title={`Remover ${m.name}?`}
                          description="A pessoa perde o acesso a esta função na organização e suas sessões ativas são encerradas se não restar vínculo."
                          confirmLabel="Remover"
                          onConfirm={() =>
                            act(() => api('DELETE', `/api/team/members/${m.membershipId}`))
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="pendentes">
        <h2 id="pendentes">Convites pendentes</h2>
        {props.invitations.length === 0 ? (
          <EmptyState title="Nenhum convite pendente" />
        ) : (
          <div className="table-wrap" role="region" aria-label="Convites pendentes" tabIndex={0}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Convidado</th>
                  <th scope="col">Função</th>
                  <th scope="col">Expira em</th>
                  <th scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {props.invitations.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.name}</strong>
                      <br />
                      <span className="muted">{i.email}</span>
                    </td>
                    <td>{i.roleName}</td>
                    <td>{fmt(i.expiresAt)}</td>
                    <td>
                      {props.can.revokeInvite && (
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          onClick={() => act(() => api('DELETE', `/api/team/invitations/${i.id}`))}
                        >
                          Revogar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
