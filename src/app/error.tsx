'use client';
import { ErrorState } from '@/ui/states';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container">
      <ErrorState
        title="Algo deu errado"
        description="Não foi possível carregar esta página. Tente novamente."
        onRetry={reset}
      />
    </div>
  );
}
