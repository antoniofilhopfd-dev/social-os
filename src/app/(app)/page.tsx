import type { Metadata } from 'next';
import Link from 'next/link';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';

export const metadata: Metadata = { title: 'Início' };

export default async function HomePage() {
  const { user, ctx } = await requireAuthPage();
  const areas = [
    {
      href: '/clientes',
      label: 'Clientes',
      show: ctx.grants.some((g) => g.permissions.has('clients:view')),
    },
    { href: '/equipe', label: 'Equipe e convites', show: canOrgWide(ctx, 'team:view') },
    { href: '/funcoes', label: 'Funções e permissões', show: canOrgWide(ctx, 'roles:view') },
    { href: '/auditoria', label: 'Registro de auditoria', show: canOrgWide(ctx, 'audit:view') },
    { href: '/minhas-sessoes', label: 'Minhas sessões', show: true },
  ].filter((a) => a.show);
  return (
    <>
      <h1>Olá, {user.name.split(' ')[0]}</h1>
      <p className="muted">
        Etapa 02: autenticação e multiempresa. O painel operacional chega na Etapa 03; por ora estas
        áreas estão disponíveis para o seu perfil:
      </p>
      <ul>
        {areas.map((a) => (
          <li key={a.href}>
            <Link href={a.href}>{a.label}</Link>
          </li>
        ))}
      </ul>
    </>
  );
}
