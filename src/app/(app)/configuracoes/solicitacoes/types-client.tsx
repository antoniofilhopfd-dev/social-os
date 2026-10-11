'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { CONFIGURABLE_FIELDS } from '@/modules/requests/rules';

interface Type {
  id: string;
  name: string;
  requiredFields: string[];
  active: boolean;
}

function TypeForm({
  type,
  canEdit,
  onSaved,
  onError,
}: {
  type?: Type;
  canEdit: boolean;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      name: f.get('name'),
      requiredFields: f.getAll('fields'),
      active: f.get('active') === 'on',
    };
    const r = type
      ? await api('PUT', `/api/request-types/${type.id}`, body)
      : await api('POST', '/api/request-types', body);
    if (r.ok) {
      if (!type) form.reset();
      onSaved();
    } else onError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao salvar.');
  }
  const id = type?.id ?? 'novo';
  return (
    <form
      onSubmit={save}
      className="section stack"
      noValidate
      aria-label={type ? `Tipo ${type.name}` : 'Novo tipo'}
    >
      <h2>
        {type ? type.name : 'Novo tipo de solicitação'}{' '}
        {type && !type.active && <Badge>Desativado</Badge>}
      </h2>
      <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <Field
          id={`t-name-${id}`}
          name="name"
          label="Nome"
          defaultValue={type?.name ?? ''}
          required
        />
        <fieldset className="stack" style={{ border: 0, padding: 0 }}>
          <legend>Campos obrigatórios</legend>
          <div className="grid">
            {Object.entries(CONFIGURABLE_FIELDS).map(([k, label]) => (
              <label key={k} className="row" style={{ minHeight: 44, flexWrap: 'nowrap' }}>
                <input
                  type="checkbox"
                  name="fields"
                  value={k}
                  className="check"
                  defaultChecked={type?.requiredFields.includes(k)}
                />{' '}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="active"
            className="check"
            defaultChecked={type?.active ?? true}
          />{' '}
          Ativo (aparece no formulário)
        </label>
        {canEdit && (
          <div>
            <Button type="submit">{type ? 'Salvar tipo' : 'Criar tipo'}</Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function TypesClient({ types, canEdit }: { types: Type[]; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const done = () => {
    setError(null);
    setSaved(true);
    router.refresh();
  };
  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Tipo salvo.</Alert>}
      {types.map((t) => (
        <TypeForm
          key={`${t.id}-${t.name}-${t.requiredFields.join()}-${t.active}`}
          type={t}
          canEdit={canEdit}
          onSaved={done}
          onError={setError}
        />
      ))}
      {canEdit && <TypeForm canEdit onSaved={done} onError={setError} />}
    </div>
  );
}
