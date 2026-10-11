'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert } from '@/ui/components';
import { ConfirmDialog } from '@/ui/confirm-dialog';

export function DeleteProject({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      <ConfirmDialog
        triggerLabel="Excluir projeto"
        title="Excluir projeto?"
        description="Só é possível excluir projetos sem tarefas abertas. A ação fica registrada na auditoria."
        confirmLabel="Excluir projeto"
        onConfirm={() =>
          void api('DELETE', `/api/projects/${id}`).then((r) => {
            if (r.ok) router.push('/projetos');
            else setError(r.error?.message ?? 'Erro ao excluir.');
          })
        }
      />
    </div>
  );
}
