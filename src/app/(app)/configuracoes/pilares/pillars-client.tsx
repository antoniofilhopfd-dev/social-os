'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button, Field } from '@/ui/components';
import { PILLAR_COLORS } from '@/modules/contents/rules';

interface Pillar {
  id: string;
  name: string;
  color: string;
  description: string | null;
  active: boolean;
}

function PillarForm({
  pillar,
  canEdit,
  onSaved,
  onError,
}: {
  pillar?: Pillar;
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
      color: f.get('color'),
      description: (f.get('description') as string) || null,
      active: f.get('active') === 'on',
    };
    const r = pillar
      ? await api('PUT', `/api/content-pillars/${pillar.id}`, body)
      : await api('POST', '/api/content-pillars', body);
    if (r.ok) {
      if (!pillar) form.reset();
      onSaved();
    } else onError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao salvar.');
  }
  const id = pillar?.id ?? 'novo';
  return (
    <form
      onSubmit={save}
      className="section stack"
      noValidate
      aria-label={pillar ? `Pilar ${pillar.name}` : 'Novo pilar'}
    >
      <h2>
        {pillar ? pillar.name : 'Novo pilar'}{' '}
        {pillar && !pillar.active && <Badge>Desativado</Badge>}
      </h2>
      <fieldset disabled={!canEdit} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="form-row">
          <Field
            id={`p-name-${id}`}
            name="name"
            label="Nome"
            defaultValue={pillar?.name ?? ''}
            required
          />
          <div className="field">
            <label htmlFor={`p-color-${id}`}>Cor no calendário</label>
            <select
              id={`p-color-${id}`}
              name="color"
              className="input"
              defaultValue={pillar?.color ?? 'blue'}
            >
              {Object.entries(PILLAR_COLORS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <Field
            id={`p-desc-${id}`}
            name="description"
            label="Descrição"
            defaultValue={pillar?.description ?? ''}
          />
        </div>
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="active"
            className="check"
            defaultChecked={pillar?.active ?? true}
          />{' '}
          Ativo
        </label>
        {canEdit && (
          <div>
            <Button type="submit">{pillar ? 'Salvar pilar' : 'Criar pilar'}</Button>
          </div>
        )}
      </fieldset>
    </form>
  );
}

export function PillarsClient({ pillars, canEdit }: { pillars: Pillar[]; canEdit: boolean }) {
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
      {saved && <Alert tone="success">Pilar salvo.</Alert>}
      {pillars.map((p) => (
        <PillarForm
          key={`${p.id}-${p.name}-${p.color}-${p.active}`}
          pillar={p}
          canEdit={canEdit}
          onSaved={done}
          onError={setError}
        />
      ))}
      {canEdit && <PillarForm canEdit onSaved={done} onError={setError} />}
    </div>
  );
}
