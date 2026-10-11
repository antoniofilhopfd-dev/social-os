'use client';
import { useState } from 'react';
import { Alert } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

/** Demonstração do diálogo de confirmação; não executa nenhuma exclusão real. */
export function ConfirmDemo() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <ConfirmDialog
        triggerLabel="Excluir (abre confirmação)"
        title="Excluir item?"
        description="Esta ação envia o item para a lixeira. Você poderá restaurá-lo."
        confirmLabel="Excluir"
        onConfirm={() => setConfirmed(true)}
      />
      {confirmed && (
        <Alert tone="success">Confirmação recebida (demonstração, nada foi excluído).</Alert>
      )}
    </>
  );
}
