import { EmptyState } from '@/ui/states';

export function Forbidden() {
  return (
    <EmptyState
      title="Acesso negado"
      description="Você não tem permissão para ver esta página. Se precisar dela, fale com o administrador da sua organização."
    />
  );
}
