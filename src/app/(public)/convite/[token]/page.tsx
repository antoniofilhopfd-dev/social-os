import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { getDb } from '@/db';
import { getAuth } from '@/core/auth/server';
import { clientIp } from '@/core/request';
import { AppError } from '@/core/errors';
import { lookupInvitation } from '@/modules/auth/service';
import { Alert } from '@/ui/components';
import { AcceptInviteForm } from './accept-form';

export const metadata: Metadata = { title: 'Convite', robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let info;
  try {
    info = await lookupInvitation(getDb(), token, clientIp(await headers()));
  } catch (e) {
    if (e instanceof AppError && e.code === 'RATE_LIMITED')
      return <Alert tone="warning">{e.message}</Alert>;
    throw e;
  }
  if (info.status === 'invalid') {
    return (
      <>
        <h1>Convite indisponível</h1>
        <Alert tone="danger">
          Este link é inválido, expirou ou já foi utilizado. Peça um novo convite ao administrador.
        </Alert>
        <p>
          <Link href="/login">Ir para o login</Link>
        </p>
      </>
    );
  }
  const auth = await getAuth();
  const sameAccount = info.userExists && auth?.user.email.toLowerCase() === info.email;
  return (
    <>
      <h1>Você foi convidado(a)</h1>
      <p className="muted">
        Função: <strong>{info.roleName}</strong> · {info.email}
      </p>
      {info.userExists && !sameAccount ? (
        <div className="stack">
          <Alert tone="info">
            Já existe uma conta com este e-mail. Entre nela para aceitar o convite.
          </Alert>
          <Link className="btn btn-primary" href="/login">
            Entrar
          </Link>
        </div>
      ) : (
        <AcceptInviteForm
          token={token}
          suggestedName={info.name}
          existingAccount={info.userExists}
        />
      )}
    </>
  );
}
