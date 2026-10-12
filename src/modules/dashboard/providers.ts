import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { clients, invitations, memberships, roles, users } from '@/db/schema';
import { canOrgWide, type Ctx } from '@/core/auth/context';
import { listContents } from '@/modules/contents/service';
import { listRequests } from '@/modules/requests/service';
import { listTasks } from '@/modules/tasks/service';
import { listApprovals } from '@/modules/approvals/service';

export type Severity = 'alert' | 'info';

export interface PendingItem {
  id: string;
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  href: string;
  clientId?: string | null;
  clientName?: string | null;
}

export interface DashboardFilters {
  /** Janela, em dias, para dados históricos (atividade). */
  days: number;
  clientId?: string;
  now: Date;
}

/**
 * Provedor de pendências: cada módulo registra o seu aqui quando passa a existir
 * (conteúdos em revisão, tarefas atrasadas, aprovações...). O dashboard não conhece os módulos.
 * Regras: `allowed` decide por permissão; `collect` só devolve dados reais e já filtrados pelo contexto.
 */
export interface PendingProvider {
  id: string;
  allowed(ctx: Ctx): boolean;
  collect(db: Db, ctx: Ctx, filters: DashboardFilters): Promise<PendingItem[]>;
}

const EXPIRING_SOON_MS = 48 * 60 * 60 * 1000;
const NEVER_ACCESSED_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

const pendingInvitations: PendingProvider = {
  id: 'team.pending-invitations',
  allowed: (ctx) => canOrgWide(ctx, 'team:view'),
  async collect(db, ctx, f) {
    const where = [
      eq(invitations.organizationId, ctx.organizationId),
      isNull(invitations.acceptedAt),
      isNull(invitations.revokedAt),
    ];
    if (f.clientId) where.push(eq(invitations.clientId, f.clientId));
    const rows = await db
      .select({ inv: invitations, roleName: roles.name, clientName: clients.name })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .leftJoin(clients, eq(clients.id, invitations.clientId))
      .where(and(...where))
      .orderBy(asc(invitations.expiresAt));
    return rows.map(({ inv, roleName, clientName }) => {
      const left = inv.expiresAt.getTime() - f.now.getTime();
      const expired = left <= 0;
      const soon = !expired && left <= EXPIRING_SOON_MS;
      return {
        id: `invitation:${inv.id}`,
        kind: 'invitation',
        severity: expired || soon ? ('alert' as const) : ('info' as const),
        title: expired
          ? `Convite vencido: ${inv.name}`
          : soon
            ? `Convite expira em breve: ${inv.name}`
            : `Convite aguardando aceite: ${inv.name}`,
        detail: `${inv.email} · ${roleName}${expired ? ' · gere um novo convite' : ''}`,
        href: '/equipe',
        clientId: inv.clientId,
        clientName,
      };
    });
  },
};

const externalNeverAccessed: PendingProvider = {
  id: 'team.external-never-accessed',
  allowed: (ctx) => canOrgWide(ctx, 'team:view'),
  async collect(db, ctx, f) {
    const where = [
      eq(memberships.organizationId, ctx.organizationId),
      eq(users.kind, 'external'),
      isNull(users.lastLoginAt),
    ];
    if (f.clientId) where.push(eq(memberships.clientId, f.clientId));
    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
        clientId: memberships.clientId,
        clientName: clients.name,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .leftJoin(clients, eq(clients.id, memberships.clientId))
      .where(and(...where));
    return rows
      .filter((r) => f.now.getTime() - r.createdAt.getTime() >= NEVER_ACCESSED_GRACE_MS)
      .map((r) => ({
        id: `external:${r.userId}:${r.clientId ?? ''}`,
        kind: 'external-access',
        severity: 'info' as const,
        title: `Acesso externo ainda não utilizado: ${r.name}`,
        detail: `${r.email}${r.clientName ? ` · ${r.clientName}` : ''}`,
        href: '/equipe',
        clientId: r.clientId,
        clientName: r.clientName,
      }));
  },
};

const requestAttention: PendingProvider = {
  id: 'requests.attention',
  allowed: (ctx) =>
    ctx.grants.some((g) => g.permissions.has('requests:view')) && ctx.userKind === 'internal',
  async collect(db, ctx, f) {
    // Reaproveita a consulta do módulo: mesma organização, mesmo escopo de cliente.
    const { items } = await listRequests(
      db,
      ctx,
      { status: 'open', clientId: f.clientId, limit: 50 },
      f.now,
    );
    const out: PendingItem[] = [];
    for (const r of items) {
      if (r.sla === 'response_overdue') {
        out.push({
          id: `request:${r.id}`,
          kind: 'request',
          severity: 'alert',
          title: `Solicitação #${r.number} sem resposta no prazo`,
          detail: `${r.clientName} · ${r.title}`,
          href: `/solicitacoes/${r.id}`,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      } else if (r.sla === 'due_overdue') {
        out.push({
          id: `request:${r.id}`,
          kind: 'request',
          severity: 'alert',
          title: `Prazo estimado vencido: #${r.number}`,
          detail: `${r.clientName} · ${r.title}`,
          href: `/solicitacoes/${r.id}`,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      } else if (r.status === 'new') {
        out.push({
          id: `request:${r.id}`,
          kind: 'request',
          severity: 'info',
          title: `Nova solicitação #${r.number}: ${r.title}`,
          detail: `${r.clientName} · aguardando triagem`,
          href: `/solicitacoes/${r.id}`,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      } else if (r.status === 'awaiting_info') {
        out.push({
          id: `request:${r.id}`,
          kind: 'request',
          severity: 'info',
          title: `Aguardando informações do solicitante: #${r.number}`,
          detail: `${r.clientName} · ${r.title}`,
          href: `/solicitacoes/${r.id}`,
          clientId: r.clientId,
          clientName: r.clientName,
        });
      }
    }
    return out;
  },
};

const contentAttention: PendingProvider = {
  id: 'contents.attention',
  allowed: (ctx) =>
    ctx.grants.some((g) => g.permissions.has('contents:view')) && ctx.userKind === 'internal',
  async collect(db, ctx, f) {
    const { items } = await listContents(
      db,
      ctx,
      { status: 'open', clientId: f.clientId, limit: 100 },
      f.now,
    );
    const out: PendingItem[] = [];
    for (const c of items) {
      const base = {
        id: `content:${c.id}`,
        kind: 'content',
        href: `/conteudos/${c.id}`,
        clientId: c.clientId,
        clientName: c.clientName,
      };
      const when = c.scheduledDate ? c.scheduledDate.split('-').reverse().join('/') : '';
      if (c.schedule === 'overdue') {
        out.push({
          ...base,
          severity: 'alert',
          title: `Conteúdo #${c.number} atrasado: ${c.title}`,
          detail: `${c.clientName} · previsto para ${when} · ${c.assigneeName ?? 'sem responsável'}`,
        });
      } else if (c.schedule === 'due_soon') {
        out.push({
          ...base,
          severity: 'alert',
          title: `Publicação próxima e ainda não pronta: #${c.number}`,
          detail: `${c.clientName} · ${c.title} · previsto para ${when}`,
        });
      } else if (c.assigneeUserId === ctx.userId && c.status === 'in_production') {
        out.push({
          ...base,
          severity: 'info',
          title: `Em produção com você: #${c.number} ${c.title}`,
          detail: c.clientName,
        });
      }
    }
    return out.slice(0, 30);
  },
};

const taskAttention: PendingProvider = {
  id: 'tasks.attention',
  allowed: (ctx) =>
    ctx.userKind === 'internal' && ctx.grants.some((g) => g.permissions.has('tasks:view')),
  async collect(db, ctx, f) {
    const { items } = await listTasks(
      db,
      ctx,
      { status: 'open', clientId: f.clientId, limit: 200 },
      f.now,
    );
    const out: PendingItem[] = [];
    for (const t of items) {
      const mine = t.assigneeUserId === ctx.userId;
      const base = {
        id: `task:${t.id}`,
        kind: 'task',
        href: `/tarefas/${t.id}`,
        clientId: t.clientId,
        clientName: t.clientName,
      };
      if (
        t.due === 'overdue' &&
        (mine ||
          t.assigneeUserId === null ||
          ctx.grants.some((g) => g.permissions.has('tasks:assign')))
      )
        out.push({
          ...base,
          severity: 'alert',
          title: `Tarefa atrasada: ${t.title}`,
          detail: `${t.clientName ?? 'Interna'} · ${t.assigneeName ?? 'sem responsável'}`,
        });
      else if (mine && (t.due === 'today' || t.status === 'blocked'))
        out.push({
          ...base,
          severity: t.status === 'blocked' ? 'alert' : 'info',
          title:
            t.status === 'blocked'
              ? `Tarefa bloqueada com você: ${t.title}`
              : `Tarefa para hoje: ${t.title}`,
          detail: t.clientName ?? 'Interna',
        });
    }
    return out.slice(0, 30);
  },
};

const approvalAttention: PendingProvider = {
  id: 'approvals.attention',
  allowed: (ctx) => ctx.grants.some((g) => g.permissions.has('approvals:view')),
  async collect(db, ctx, f) {
    const external = ctx.userKind !== 'internal';
    const { items } = await listApprovals(db, ctx, {
      clientId: f.clientId,
      status: external ? 'pending' : undefined,
      limit: 100,
    });
    const out: PendingItem[] = [];
    for (const a of items) {
      const base = {
        id: `approval:${a.id}`,
        kind: 'approval',
        href: `/aprovacoes/${a.id}`,
        clientId: a.clientId,
        clientName: a.clientName,
      };
      if (external && a.status === 'pending')
        out.push({
          ...base,
          severity: 'alert',
          title: `Conteúdo para aprovar: ${a.title}`,
          detail: `Enviado em ${a.requestedAt.toLocaleDateString('pt-BR')}`,
        });
      else if (!external && a.status === 'changes_requested')
        out.push({
          ...base,
          severity: 'alert',
          title: `Cliente pediu ajustes: #${a.contentNumber} ${a.title}`,
          detail: a.clientName,
        });
      else if (!external && a.status === 'pending') {
        const days = Math.floor((f.now.getTime() - a.requestedAt.getTime()) / 86_400_000);
        if (days >= 3)
          out.push({
            ...base,
            severity: 'info',
            title: `Sem resposta do cliente há ${days} dias: #${a.contentNumber} ${a.title}`,
            detail: a.clientName,
          });
      }
    }
    return out.slice(0, 30);
  },
};

export const PENDING_PROVIDERS: PendingProvider[] = [
  requestAttention,
  approvalAttention,
  taskAttention,
  contentAttention,
  pendingInvitations,
  externalNeverAccessed,
];
