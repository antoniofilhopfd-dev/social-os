import { and, eq, like, or } from 'drizzle-orm';
import type { Db } from '@/db';
import { memberships, users } from '@/db/schema';
import { canOrgWide, type Ctx } from '@/core/auth/context';
import { listClients, likePattern } from '@/modules/clients/service';
import { listContents } from '@/modules/contents/service';
import { listTasks } from '@/modules/tasks/service';
import { listRequests } from '@/modules/requests/service';

export const SEARCH_MIN_LENGTH = 2;
const LIMIT = 8;

export interface SearchResults {
  clients: { id: string; name: string; href: string }[];
  requests: { id: string; label: string; href: string }[];
  contents: { id: string; label: string; href: string }[];
  tasks: { id: string; label: string; href: string }[];
  people: { userId: string; name: string; email: string; href: string }[];
}

/**
 * Busca global. Cada fonte aplica o MESMO controle de acesso do módulo de origem:
 * clientes respeitam o escopo do usuário e pessoas exigem `team:view` na organização.
 */
export async function searchAll(db: Db, ctx: Ctx, rawQuery: string): Promise<SearchResults> {
  const q = rawQuery.trim().slice(0, 80);
  if (q.length < SEARCH_MIN_LENGTH)
    return { clients: [], people: [], requests: [], contents: [], tasks: [] };

  const clientRows = ctx.grants.some((g) => g.permissions.has('clients:view'))
    ? await listClients(db, ctx, { q, limit: LIMIT })
    : [];

  const requestRows = ctx.grants.some((g) => g.permissions.has('requests:view'))
    ? (await listRequests(db, ctx, { q, limit: LIMIT })).items
    : [];

  const contentRows = ctx.grants.some((g) => g.permissions.has('contents:view'))
    ? (await listContents(db, ctx, { q, limit: LIMIT })).items
    : [];

  const taskRows =
    ctx.userKind === 'internal' && ctx.grants.some((g) => g.permissions.has('tasks:view'))
      ? (await listTasks(db, ctx, { q, limit: LIMIT })).items
      : [];

  let people: SearchResults['people'] = [];
  if (canOrgWide(ctx, 'team:view')) {
    const pattern = likePattern(q);
    const rows = await db
      .selectDistinct({ userId: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, ctx.organizationId),
          or(like(users.name, pattern), like(users.email, pattern)),
        ),
      )
      .orderBy(users.name)
      .limit(LIMIT);
    people = rows.map((r) => ({ ...r, href: `/equipe?q=${encodeURIComponent(r.email)}` }));
  }
  return {
    clients: clientRows.map((c) => ({
      id: c.id,
      name: c.name,
      href: `/clientes?q=${encodeURIComponent(c.name)}`,
    })),
    requests: requestRows.map((r) => ({
      id: r.id,
      label: `#${r.number} · ${r.title}`,
      href: `/solicitacoes/${r.id}`,
    })),
    contents: contentRows.map((c) => ({
      id: c.id,
      label: `#${c.number} · ${c.title}`,
      href: `/conteudos/${c.id}`,
    })),
    tasks: taskRows.map((t) => ({ id: t.id, label: t.title, href: `/tarefas/${t.id}` })),
    people,
  };
}
