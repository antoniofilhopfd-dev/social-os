'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  kind: 'internal' | 'external';
  permissions: string[];
  members: number;
}
interface Mod {
  key: string;
  label: string;
  actions: string[];
}

export function RolesClient(props: {
  roles: Role[];
  modules: Mod[];
  actionLabels: Record<string, string>;
  myPermissions: string[];
  can: { create: boolean; edit: boolean; remove: boolean };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | 'new'>(props.roles[0]?.id ?? 'new');
  const role = props.roles.find((r) => r.id === selected);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [kind, setKind] = useState<'internal' | 'external'>(role?.kind ?? 'internal');
  const mine = useMemo(() => new Set(props.myPermissions), [props.myPermissions]);
  const allActions = useMemo(
    () => [...new Set(props.modules.flatMap((m) => m.actions))],
    [props.modules],
  );

  const readOnly = selected !== 'new' && (role?.isSystem || !props.can.edit);
  const creating = selected === 'new';

  function choose(id: string | 'new') {
    const r = props.roles.find((x) => x.id === id);
    setSelected(id);
    setError(null);
    setSaved(false);
    setChecked(new Set(r?.permissions ?? []));
    setKind(r?.kind ?? 'internal');
  }
  function toggle(code: string) {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: f.get('name'),
      description: f.get('description') ?? '',
      kind,
      permissions: [...checked],
    };
    const r = creating
      ? await api<{ id: string }>('POST', '/api/roles', body)
      : await api('PUT', `/api/roles/${selected}`, body);
    if (r.ok) {
      setError(null);
      setSaved(true);
      router.refresh();
      if (creating) setSelected((r.data as { id: string }).id);
    } else setError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao salvar.');
  }
  async function remove() {
    const r = await api('DELETE', `/api/roles/${selected}`);
    if (r.ok) {
      choose('new');
      router.refresh();
    } else setError(r.error?.message ?? 'Erro ao excluir.');
  }

  return (
    <div className="stack">
      <div className="row" role="group" aria-label="Funções">
        {props.roles.map((r) => (
          <Button
            key={r.id}
            variant={selected === r.id ? 'primary' : 'secondary'}
            className="btn-sm"
            aria-pressed={selected === r.id}
            onClick={() => choose(r.id)}
          >
            {r.name}
          </Button>
        ))}
        {props.can.create && (
          <Button
            variant={creating ? 'primary' : 'secondary'}
            className="btn-sm"
            aria-pressed={creating}
            onClick={() => choose('new')}
          >
            + Nova função
          </Button>
        )}
      </div>

      <form key={selected} onSubmit={save} className="section stack" noValidate>
        <h2>{creating ? 'Nova função' : role?.name}</h2>
        {error && <Alert tone="danger">{error}</Alert>}
        {saved && <Alert tone="success">Função salva.</Alert>}
        {role?.isSystem && (
          <Alert tone="info">
            Função do sistema: não pode ser editada. {role.members} vínculo(s) em uso.
          </Alert>
        )}
        <div className="form-row">
          <Field
            id="role-name"
            name="name"
            label="Nome"
            defaultValue={role?.name ?? ''}
            readOnly={readOnly}
            required
          />
          <Field
            id="role-desc"
            name="description"
            label="Descrição"
            defaultValue={role?.description ?? ''}
            readOnly={readOnly}
          />
          <div className="field">
            <label htmlFor="role-kind">Tipo</label>
            <select
              id="role-kind"
              className="input"
              value={kind}
              disabled={readOnly}
              onChange={(e) => setKind(e.target.value as 'internal' | 'external')}
            >
              <option value="internal">Interna (equipe)</option>
              <option value="external">Externa (portal do cliente)</option>
            </select>
          </div>
        </div>

        <div className="table-wrap" role="region" aria-label="Matriz de permissões" tabIndex={0}>
          <table className="matrix">
            <thead>
              <tr>
                <th scope="col">Módulo</th>
                {allActions.map((a) => (
                  <th key={a} scope="col" className="center">
                    {props.actionLabels[a] ?? a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {props.modules.map((m) => (
                <tr key={m.key}>
                  <th scope="row">{m.label}</th>
                  {allActions.map((a) => {
                    const code = `${m.key}:${a}`;
                    if (!m.actions.includes(a))
                      return (
                        <td key={a} className="center" aria-hidden="true">
                          –
                        </td>
                      );
                    const locked = readOnly || !mine.has(code);
                    return (
                      <td key={a} className="center">
                        <input
                          type="checkbox"
                          className="check"
                          checked={checked.has(code)}
                          disabled={locked && !checked.has(code) ? true : readOnly}
                          title={
                            !readOnly && !mine.has(code)
                              ? 'Você não possui esta permissão'
                              : undefined
                          }
                          aria-label={`${props.actionLabels[a] ?? a} em ${m.label}`}
                          onChange={() => toggle(code)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!readOnly && (
          <div className="actions">
            <Button type="submit">{creating ? 'Criar função' : 'Salvar alterações'}</Button>
            {!creating && props.can.remove && (
              <ConfirmDialog
                triggerLabel="Excluir função"
                title={`Excluir ${role?.name}?`}
                description="Só é possível excluir funções que não estejam em uso."
                confirmLabel="Excluir"
                onConfirm={remove}
              />
            )}
          </div>
        )}
        {role && !role.isSystem && (
          <p className="field-hint">
            <Badge>{role.members} vínculo(s)</Badge>
          </p>
        )}
      </form>
    </div>
  );
}
