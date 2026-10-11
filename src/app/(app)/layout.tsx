import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { organizations } from '@/db/schema';
import { can, canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { LogoutButton } from '@/ui/logout-button';
import { Nav } from '@/ui/nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ctx } = await requireAuthPage();
  const [org] = await getDb()
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
    .limit(1);

  const items = [{ href: '/', label: 'Início' }];
  if (ctx.grants.some((g) => g.permissions.has('clients:view')))
    items.push({ href: '/clientes', label: 'Clientes' });
  if (canOrgWide(ctx, 'team:view')) items.push({ href: '/equipe', label: 'Equipe' });
  if (canOrgWide(ctx, 'roles:view')) items.push({ href: '/funcoes', label: 'Funções' });
  if (canOrgWide(ctx, 'audit:view')) items.push({ href: '/auditoria', label: 'Auditoria' });
  items.push({ href: '/minhas-sessoes', label: 'Minhas sessões' });
  void can;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Social Media OS</span>
          <Nav items={items} />
          <span className="who">
            {user.name} · {org?.name}
          </span>
          <LogoutButton />
        </div>
      </header>
      <div className="container">{children}</div>
    </>
  );
}
