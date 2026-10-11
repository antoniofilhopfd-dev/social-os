import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <h1>Social Media OS</h1>
      <p className="muted">
        Etapa 01 (fundação). Ainda não há telas de negócio: autenticação começa na Etapa 02.
      </p>
      <p>
        <Link href="/design-system">Ver design system</Link>
      </p>
    </div>
  );
}
