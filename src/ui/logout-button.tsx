'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Button } from '@/ui/components';

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="secondary"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Sem sessão válida a API devolve 401; em qualquer caso o destino é o login.
        await api('POST', '/api/auth/logout');
        router.replace('/login');
        router.refresh();
      }}
    >
      Sair
    </Button>
  );
}
