'use client';
import { ErrorState } from '@/ui/states';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Não foi possível carregar esta página"
      description="Tente novamente. Se o problema continuar, avise a administração."
      onRetry={reset}
    />
  );
}
