import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getDb } from '@/db';
import { clientIp } from '@/core/request';
import { AppError } from '@/core/errors';
import { lookupPasswordReset } from '@/modules/auth/service';
import { Alert } from '@/ui/components';
import { ResetForm } from './reset-form';

export const metadata: Metadata = { title: 'Definir senha', robots: { index: false } };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info;
  try {
    info = await lookupPasswordReset(getDb(), token, clientIp(await headers()));
  } catch (e) {
    if (e instanceof AppError && e.code === 'RATE_LIMITED')
      return <Alert tone="warning">{e.message}</Alert>;
    throw e;
  }
  if (!info) {
    return (
      <>
        <h1>Link indisponível</h1>
        <Alert tone="danger">
          Este link é inválido, expirou ou já foi utilizado. Peça um novo ao administrador.
        </Alert>
        <p>
          <Link href="/login">Ir para o login</Link>
        </p>
      </>
    );
  }
  return (
    <>
      <h1>Definir nova senha</h1>
      <p className="muted">{info.email}</p>
      <ResetForm token={token} />
    </>
  );
}
