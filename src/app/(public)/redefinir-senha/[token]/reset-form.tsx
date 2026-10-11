'use client';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Button, Field } from '@/ui/components';

export function ResetForm({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    if (form.get('password') !== form.get('confirm')) return setError('As senhas não coincidem.');
    setBusy(true);
    const r = await api('POST', '/api/auth/reset-password', {
      token,
      password: form.get('password'),
    });
    setBusy(false);
    if (r.ok) setDone(true);
    else setError(r.error?.message ?? 'Não foi possível definir a senha.');
  }

  if (done) {
    return (
      <div className="stack">
        <Alert tone="success">Senha definida. Suas outras sessões foram encerradas.</Alert>
        <a className="btn btn-primary" href="/login">
          Entrar
        </a>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="stack" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field
        id="password"
        name="password"
        label="Nova senha"
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
      <Button type="submit" disabled={busy}>
        {busy ? 'Salvando…' : 'Salvar senha'}
      </Button>
    </form>
  );
}
