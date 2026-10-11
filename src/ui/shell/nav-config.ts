import { canOrgWide, type Ctx } from '@/core/auth/context';

export interface NavItem {
  href: string;
  label: string;
}
export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Menu por permissão. É só conveniência de interface: o backend continua sendo a barreira.
 * Módulos futuros (conteúdos, tarefas...) acrescentam seus itens aqui quando existirem.
 */
export function buildNav(ctx: Ctx): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: 'Principal',
      items: [
        { href: '/', label: 'Início' },
        { href: '/notificacoes', label: 'Notificações' },
      ],
    },
  ];
  const operation: NavItem[] = [];
  if (ctx.grants.some((g) => g.permissions.has('requests:view')))
    operation.push({ href: '/solicitacoes', label: 'Solicitações' });
  if (ctx.grants.some((g) => g.permissions.has('contents:view')))
    operation.push({ href: '/conteudos', label: 'Conteúdos' });
  if (operation.length) groups.push({ label: 'Operação', items: operation });
  if (ctx.grants.some((g) => g.permissions.has('clients:view'))) {
    groups.push({ label: 'Cadastros', items: [{ href: '/clientes', label: 'Clientes' }] });
  }
  const admin: NavItem[] = [];
  if (canOrgWide(ctx, 'team:view')) admin.push({ href: '/equipe', label: 'Equipe' });
  if (canOrgWide(ctx, 'roles:view')) admin.push({ href: '/funcoes', label: 'Funções' });
  if (canOrgWide(ctx, 'audit:view')) admin.push({ href: '/auditoria', label: 'Auditoria' });
  if (canOrgWide(ctx, 'settings:view'))
    admin.push({ href: '/configuracoes/solicitacoes', label: 'Tipos de solicitação' });
  if (admin.length) groups.push({ label: 'Administração', items: admin });
  groups.push({
    label: 'Minha conta',
    items: [
      { href: '/minhas-sessoes', label: 'Minhas sessões' },
      { href: '/notificacoes/preferencias', label: 'Preferências de notificação' },
    ],
  });
  return groups;
}
