'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';

export function NewClientForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = await api<{ id: string }>('POST', '/api/clients', {
      name: new FormData(e.currentTarget).get('name'),
    });
    if (r.ok) router.push(`/clientes/${r.data!.id}`);
    else setError(r.error?.details?.name?.[0] ?? r.error?.message ?? 'Erro ao criar.');
  }
  return (
    <form onSubmit={create} className="section stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="form-row">
        <Field id="novo-cliente" name="name" label="Novo cliente" required />
        <div>
          <Button type="submit">Adicionar e configurar</Button>
        </div>
      </div>
    </form>
  );
}
