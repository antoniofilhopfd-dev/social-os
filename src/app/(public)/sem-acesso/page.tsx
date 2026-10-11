import type { Metadata } from 'next';
import { Alert } from '@/ui/components';
import { LogoutButton } from '@/ui/logout-button';

export const metadata: Metadata = { title: 'Sem acesso' };

export default function NoAccessPage() {
  return (
    <>
      <h1>Sem acesso</h1>
      <Alert tone="warning">
        Sua conta está ativa, mas não está vinculada a nenhuma organização. Peça um convite ao
        administrador.
      </Alert>
      <p>
        <LogoutButton />
      </p>
    </>
  );
}
