'use client';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';

interface Item {
  type: string;
  enabled: boolean;
  label: string;
  description: string;
}

export function PreferencesClient({ items }: { items: Item[] }) {
  const [state, setState] = useState(() =>
    Object.fromEntries(items.map((i) => [i.type, i.enabled])),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function toggle(type: string, enabled: boolean) {
    const previous = state[type];
    setState((s) => ({ ...s, [type]: enabled }));
    const r = await api('PUT', '/api/notifications/preferences', { type, enabled });
    if (r.ok) {
      setError(null);
      setSaved(type);
    } else {
      setState((s) => ({ ...s, [type]: previous! }));
      setError(r.error?.message ?? 'Não foi possível salvar.');
    }
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <div role="status" className="sr-only">
        {saved ? 'Preferência salva.' : ''}
      </div>
      <fieldset className="section stack" style={{ margin: 0 }}>
        <legend className="sr-only">Tipos de notificação</legend>
        {items.map((i) => (
          <label
            key={i.type}
            className="row"
            style={{ alignItems: 'flex-start', flexWrap: 'nowrap', minHeight: 44 }}
          >
            <input
              type="checkbox"
              className="check"
              checked={state[i.type]}
              onChange={(e) => toggle(i.type, e.target.checked)}
            />
            <span>
              <strong>{i.label}</strong>
              <br />
              <span className="muted">{i.description}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
