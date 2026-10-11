'use client';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';

export function LoginForm({ next }: { next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await api('POST', '/api/auth/login', {
      email: form.get('email'),
      password: form.get('password'),
    });
    if (r.ok) {
      window.location.assign(next);
      return;
    }
    setError(r.error?.message ?? 'Não foi possível entrar.');
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field id="email" name="email" label="E-mail" type="email" autoComplete="username" required />
      <Field
        id="password"
        name="password"
        label="Senha"
        type="password"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={busy}>
        {busy ? 'Entrando…' : 'Entrar'}
      </Button>
      <p className="field-hint">
        Esqueceu a senha? Peça um novo link de acesso ao administrador da sua organização.
      </p>
    </form>
  );
}
