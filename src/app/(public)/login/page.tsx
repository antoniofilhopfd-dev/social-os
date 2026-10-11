import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuth } from '@/core/auth/server';
import { Alert } from '@/ui/components';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Entrar' };

/** Aceita só caminhos internos; bloqueia `//host` e `/\\host` (redirecionamento aberto). */
function safeNext(next: string | undefined): string {
  return next && /^\/(?![/\\])/.test(next) ? next : '/';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ motivo?: string; next?: string }>;
}) {
  const { motivo, next } = await searchParams;
  const auth = await getAuth();
  if (auth?.ctx) redirect('/');
  return (
    <>
      <h1>Entrar</h1>
      {motivo === 'expirada' && (
        <Alert tone="warning">Sua sessão expirou ou foi encerrada. Entre novamente.</Alert>
      )}
      <LoginForm next={safeNext(next)} />
    </>
  );
}
