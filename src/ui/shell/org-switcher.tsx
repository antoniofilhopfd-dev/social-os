'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';

export function OrgSwitcher({
  orgs,
  activeId,
}: {
  orgs: { id: string; name: string }[];
  activeId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const active = orgs.find((o) => o.id === activeId);
  if (orgs.length <= 1)
    return (
      <span className="user-name" title="Organização">
        {active?.name}
      </span>
    );

  return (
    <div>
      <label htmlFor="org-select" className="sr-only">
        Organização ativa
      </label>
      <select
        id="org-select"
        className="input org-select"
        value={activeId}
        onChange={async (e) => {
          const r = await api('POST', '/api/session/organization', {
            organizationId: e.target.value,
          });
          if (r.ok) {
            setError(null);
            router.replace('/');
            router.refresh();
          } else setError(r.error?.message ?? 'Não foi possível trocar de organização.');
        }}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
