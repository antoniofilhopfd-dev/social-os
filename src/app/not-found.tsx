import Link from 'next/link';
import { EmptyState } from '@/ui/states';

export default function NotFound() {
  return (
    <main id="conteudo" className="container">
      <EmptyState title="Página não encontrada" description="O endereço não existe ou foi movido.">
        <Link href="/">Voltar ao início</Link>
      </EmptyState>
    </main>
  );
}
