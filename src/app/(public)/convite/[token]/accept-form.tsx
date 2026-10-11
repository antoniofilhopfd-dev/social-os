'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';

export function AcceptInviteForm({
  token,
  suggestedName,
  existingAccount,
}: {
  token: string;
  suggestedName: string;
  existingAccount: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const confirm = form.get('confirm');
    if (!existingAccount && form.get('password') !== confirm) {
      setError('As senhas não coincidem.');
      setBusy(false);
      return;
    }
    const r = await api('POST', '/api/auth/accept-invite', {
      token,
      ...(existingAccount ? {} : { name: form.get('name'), password: form.get('password') }),
    });
    if (r.ok) {
      router.replace('/');
      router.refresh();
      return;
    }
    setError(r.error?.message ?? 'Não foi possível aceitar o convite.');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      {!existingAccount && (
        <>
          <Field id="name" name="name" label="Seu nome" defaultValue={suggestedName} required />
          <Field
            id="password"
            name="password"
            label="Crie uma senha"
            type="password"
            autoComplete="new-password"
            hint="Mínimo de 12 caracteres."
            required
          />
          <Field
            id="confirm"
            name="confirm"
            label="Repita a senha"
            type="password"
            autoComplete="new-password"
            required
          />
        </>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Aguarde…' : existingAccount ? 'Aceitar convite' : 'Criar conta e entrar'}
      </Button>
    </form>
  );
}
