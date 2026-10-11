import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  clients,
  contents,
  memberships,
  projects,
  taskChecklistItems,
  taskComments,
  taskEvents,
  tasks,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { can, clientScope, requireAnyScope, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { assertInternalMember, likePattern } from '@/modules/clients/service';
import { visibleContents } from '@/modules/contents/service';
import { notify } from '@/modules/notifications/service';
import {
  CLOSED_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  TASK_STATUS_LABELS,
  dueState,
  type TaskStatus,
} from './rules';

export const TASKS_PAGE_SIZE = 50;
const nf = (what = 'Tarefa') => new AppError('NOT_FOUND', `${what} não encontrada.`);
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const todayIso = (now = new Date()) => now.toISOString().slice(0, 10);

function internalOnly(ctx: Ctx) {
  if (ctx.userKind !== 'internal') throw forbidden();
}

/**
 * Condição base de TODA consulta de tarefas: organização + escopo de cliente de `tasks:view` + não excluída.
 * Tarefas sem cliente (internas da organização) só aparecem para quem tem a permissão na organização inteira.
 * Externos não acessam tarefas.
 */
export function visibleTasks(ctx: Ctx) {
  const base: (SQL | undefined)[] = [
    eq(tasks.organizationId, ctx.organizationId),
    isNull(tasks.deletedAt),
  ];
  if (ctx.userKind !== 'internal') return and(...base, eq(tasks.id, '__none__'));
  const scope = clientScope(ctx, 'tasks:view');
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(tasks.id, '__none__'));
  return and(...base, inArray(tasks.clientId, scope.clientIds));
}
export function visibleProjects(ctx: Ctx) {
  const base: (SQL | undefined)[] = [
    eq(projects.organizationId, ctx.organizationId),
    isNull(projects.deletedAt),
  ];
  if (ctx.userKind !== 'internal') return and(...base, eq(projects.id, '__none__'));
  const scope = clientScope(ctx, 'tasks:view');
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(projects.id, '__none__'));
  return and(...base, inArray(projects.clientId, scope.clientIds));
}

const permFor = (ctx: Ctx, perm: string, clientId: string | null) =>
  clientId
    ? can(ctx, perm, clientId)
    : ctx.grants.some((g) => g.clientId === null && g.permissions.has(perm));

async function loadTask(db: Db, ctx: Ctx, id: string, perm = 'tasks:view') {
  requireAnyScope(ctx, perm);
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(visibleTasks(ctx), eq(tasks.id, id)));
  if (!t) throw nf();
  if (!permFor(ctx, perm, t.clientId)) throw forbidden();
  return t;
}

async function event(
  db: Pick<Db, 'insert'>,
  ctx: Ctx,
  taskId: string,
  kind: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(taskEvents).values({
    id: newId(),
    organizationId: ctx.organizationId,
    taskId,
    actorUserId: ctx.userId,
    kind,
    metadata: metadata ?? null,
  });
}

// ------------------------------------------------------------------ pessoas
export async function listTaskAssignees(db: Db, ctx: Ctx) {
  internalOnly(ctx);
  requireAnyScope(ctx, 'tasks:view');
  return db
    .selectDistinct({ id: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, ctx.organizationId),
        eq(users.kind, 'internal'),
        eq(users.status, 'active'),
      ),
    )
    .orderBy(users.name);
}

// ----------------------------------------------------------------- projetos
async function loadProject(db: Db, ctx: Ctx, id: string, perm = 'tasks:view') {
  requireAnyScope(ctx, perm);
  const [p] = await db
    .select()
    .from(projects)
    .where(and(visibleProjects(ctx), eq(projects.id, id)));
  if (!p) throw nf('Projeto');
  if (!can(ctx, perm, p.clientId)) throw forbidden();
  return p;
}

export interface ProjectInput {
  clientId: string;
  name: string;
  description?: string | null;
  status?: string;
  startDate?: string | null;
  dueDate?: string | null;
  ownerUserId?: string | null;
}

function checkDates(start?: string | null, due?: string | null) {
  if (start && due && due < start)
    throw new AppError('VALIDATION', 'O prazo não pode ser anterior ao início.', {
      dueDate: ['O prazo não pode ser anterior ao início.'],
    });
}

export async function createProject(db: Db, ctx: Ctx, input: ProjectInput) {
  internalOnly(ctx);
  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, input.clientId), eq(clients.organizationId, ctx.organizationId)));
  if (!client || !can(ctx, 'tasks:view', input.clientId)) throw nf('Cliente');
  if (!can(ctx, 'tasks:create', input.clientId)) throw forbidden();
  checkDates(input.startDate, input.dueDate);
  if (input.ownerUserId) await assertInternalMember(db, ctx.organizationId, input.ownerUserId);
  const id = newId();
  await db.insert(projects).values({
    id,
    organizationId: ctx.organizationId,
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? null,
    status: (input.status as 'planning') ?? 'planning',
    startDate: input.startDate ?? null,
    dueDate: input.dueDate ?? null,
    ownerUserId: input.ownerUserId ?? null,
    createdBy: ctx.userId,
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'project.created',
    entityType: 'project',
    entityId: id,
    metadata: { name: input.name },
    ip: ctx.ip,
  });
  return { id };
}

export async function updateProject(
  db: Db,
  ctx: Ctx,
  id: string,
  patch: Partial<Omit<ProjectInput, 'clientId'>>,
) {
  const p = await loadProject(db, ctx, id, 'tasks:edit');
  checkDates(
    patch.startDate !== undefined ? patch.startDate : p.startDate,
    patch.dueDate !== undefined ? patch.dueDate : p.dueDate,
  );
  if (patch.ownerUserId) await assertInternalMember(db, ctx.organizationId, patch.ownerUserId);
  const set: Record<string, unknown> = {};
  for (const k of ['name', 'description', 'status', 'startDate', 'dueDate', 'ownerUserId'] as const)
    if (k in patch) set[k] = patch[k] ?? null;
  if (Object.keys(set).length === 0) return { id };
  await db.update(projects).set(set).where(eq(projects.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'project.updated',
    entityType: 'project',
    entityId: id,
    metadata: { fields: Object.keys(set) },
    ip: ctx.ip,
  });
  return { id };
}

export async function deleteProject(db: Db, ctx: Ctx, id: string) {
  const p = await loadProject(db, ctx, id, 'tasks:delete');
  const [open] = await db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, id),
        isNull(tasks.deletedAt),
        inArray(tasks.status, OPEN_TASK_STATUSES),
      ),
    );
  if (Number(open?.n ?? 0) > 0)
    throw new AppError(
      'CONFLICT',
      'Conclua ou cancele as tarefas abertas antes de excluir o projeto.',
    );
  await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'project.deleted',
    entityType: 'project',
    entityId: id,
    metadata: { name: p.name },
    ip: ctx.ip,
  });
}

export async function listProjects(
  db: Db,
  ctx: Ctx,
  f: { clientId?: string; status?: string; q?: string } = {},
) {
  internalOnly(ctx);
  requireAnyScope(ctx, 'tasks:view');
  const where: (SQL | undefined)[] = [visibleProjects(ctx)];
  if (f.clientId) where.push(eq(projects.clientId, f.clientId));
  if (f.status) where.push(eq(projects.status, f.status as 'active'));
  if (f.q) where.push(like(projects.name, likePattern(f.q)));
  const rows = await db
    .select({ p: projects, clientName: clients.name, owner: users.name })
    .from(projects)
    .innerJoin(clients, eq(clients.id, projects.clientId))
    .leftJoin(users, eq(users.id, projects.ownerUserId))
    .where(and(...where))
    .orderBy(desc(projects.createdAt))
    .limit(200);
  const ids = rows.map((r) => r.p.id);
  const counts = ids.length
    ? await db
        .select({
          projectId: tasks.projectId,
          done: sql<number>`SUM(${tasks.status} = 'done')`,
          open: sql<number>`SUM(${tasks.status} IN ('todo','in_progress','blocked','in_review'))`,
        })
        .from(tasks)
        .where(and(inArray(tasks.projectId, ids), isNull(tasks.deletedAt)))
        .groupBy(tasks.projectId)
    : [];
  const by = new Map(counts.map((c) => [c.projectId, c]));
  return rows.map(({ p, clientName, owner }) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    clientId: p.clientId,
    clientName,
    ownerName: owner,
    startDate: p.startDate,
    dueDate: p.dueDate,
    tasksDone: Number(by.get(p.id)?.done ?? 0),
    tasksOpen: Number(by.get(p.id)?.open ?? 0),
  }));
}

export async function getProject(db: Db, ctx: Ctx, id: string) {
  internalOnly(ctx);
  const p = await loadProject(db, ctx, id);
  const [[client], [owner]] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, p.clientId)),
    p.ownerUserId
      ? db.select({ name: users.name }).from(users).where(eq(users.id, p.ownerUserId))
      : Promise.resolve([] as { name: string }[]),
  ]);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    clientId: p.clientId,
    clientName: client?.name ?? '',
    ownerUserId: p.ownerUserId,
    ownerName: owner?.name ?? null,
    startDate: p.startDate,
    dueDate: p.dueDate,
    permissions: {
      edit: can(ctx, 'tasks:edit', p.clientId),
      delete: can(ctx, 'tasks:delete', p.clientId),
      create: can(ctx, 'tasks:create', p.clientId),
    },
  };
}

// ------------------------------------------------------------------- tarefas
export interface TaskInput {
  clientId?: string | null;
  projectId?: string | null;
  contentId?: string | null;
  title: string;
  description?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  assigneeUserId?: string | null;
}

/** Resolve o cliente da tarefa a partir do projeto/conteúdo e valida o escopo de cada vínculo. */
async function resolveLinks(
  db: Db,
  ctx: Ctx,
  input: { clientId?: string | null; projectId?: string | null; contentId?: string | null },
) {
  let clientId: string | null = input.clientId ?? null;
  if (input.projectId) {
    const p = await loadProject(db, ctx, input.projectId);
    if (clientId && clientId !== p.clientId)
      throw new AppError('VALIDATION', 'O projeto pertence a outro cliente.', {
        projectId: ['Escolha um projeto do mesmo cliente.'],
      });
    clientId = p.clientId;
  }
  if (input.contentId) {
    const [c] = await db
      .select({ id: contents.id, clientId: contents.clientId })
      .from(contents)
      .where(and(visibleContents(ctx), eq(contents.id, input.contentId)));
    if (!c)
      throw new AppError('VALIDATION', 'Conteúdo inválido.', {
        contentId: ['Conteúdo não encontrado.'],
      });
    if (clientId && clientId !== c.clientId)
      throw new AppError('VALIDATION', 'O conteúdo pertence a outro cliente.', {
        contentId: ['Escolha um conteúdo do mesmo cliente.'],
      });
    clientId = c.clientId;
  }
  if (clientId) {
    const [cl] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.organizationId, ctx.organizationId)));
    if (!cl || !can(ctx, 'tasks:view', clientId)) throw nf('Cliente');
  }
  return clientId;
}

export async function createTask(db: Db, ctx: Ctx, input: TaskInput) {
  internalOnly(ctx);
  requireAnyScope(ctx, 'tasks:create');
  const clientId = await resolveLinks(db, ctx, input);
  if (!permFor(ctx, 'tasks:create', clientId)) throw forbidden();
  if (input.assigneeUserId) {
    await assertInternalMember(db, ctx.organizationId, input.assigneeUserId);
    if (input.assigneeUserId !== ctx.userId && !permFor(ctx, 'tasks:assign', clientId))
      throw forbidden();
  }
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(tasks).values({
      id,
      organizationId: ctx.organizationId,
      clientId,
      projectId: input.projectId ?? null,
      contentId: input.contentId ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? 'normal',
      dueDate: input.dueDate ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      createdBy: ctx.userId,
    });
    await event(tx, ctx, id, 'created');
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'task.created',
      entityType: 'task',
      entityId: id,
      metadata: { title: input.title },
      ip: ctx.ip,
    });
  });
  if (input.assigneeUserId && input.assigneeUserId !== ctx.userId)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: input.assigneeUserId,
      type: 'task_assigned',
      title: `Nova tarefa para você: ${input.title}`,
      link: `/tarefas/${id}`,
    });
  return { id };
}

export async function updateTask(
  db: Db,
  ctx: Ctx,
  id: string,
  patch: Partial<Omit<TaskInput, 'clientId'>>,
) {
  const t = await loadTask(db, ctx, id, 'tasks:edit');
  if (CLOSED_TASK_STATUSES.includes(t.status))
    throw new AppError('CONFLICT', 'Reabra a tarefa para editá-la.');
  const set: Record<string, unknown> = {};
  const changes: Record<string, unknown> = {};
  let clientId = t.clientId;
  if ('projectId' in patch || 'contentId' in patch) {
    const projectId = 'projectId' in patch ? (patch.projectId ?? null) : t.projectId;
    const contentId = 'contentId' in patch ? (patch.contentId ?? null) : t.contentId;
    // Se não há vínculos restantes, o cliente atual é mantido; com vínculos, ele é revalidado.
    const resolved = await resolveLinks(db, ctx, {
      clientId: projectId || contentId ? null : t.clientId,
      projectId,
      contentId,
    });
    if (resolved !== t.clientId && (projectId || contentId))
      throw new AppError('VALIDATION', 'Os vínculos pertencem a outro cliente.', {
        projectId: ['Não é possível mover a tarefa para outro cliente.'],
      });
    clientId = resolved;
    set.projectId = projectId;
    set.contentId = contentId;
  }
  for (const k of ['title', 'description', 'priority', 'dueDate'] as const)
    if (k in patch && (patch[k] ?? null) !== (t[k] ?? null)) {
      set[k] = patch[k] ?? null;
      changes[k] = { from: t[k], to: patch[k] ?? null };
    }
  let newAssignee: string | null = null;
  if ('assigneeUserId' in patch && (patch.assigneeUserId ?? null) !== t.assigneeUserId) {
    if (patch.assigneeUserId) {
      await assertInternalMember(db, ctx.organizationId, patch.assigneeUserId);
      if (patch.assigneeUserId !== ctx.userId && !permFor(ctx, 'tasks:assign', clientId))
        throw forbidden();
    } else if (!permFor(ctx, 'tasks:assign', clientId) && t.assigneeUserId !== ctx.userId)
      throw forbidden();
    set.assigneeUserId = patch.assigneeUserId ?? null;
    newAssignee = patch.assigneeUserId ?? null;
    changes.assigneeUserId = true;
  }
  if (Object.keys(set).length === 0) return { id };
  await db.transaction(async (tx) => {
    await tx.update(tasks).set(set).where(eq(tasks.id, id));
    await event(
      tx,
      ctx,
      id,
      newAssignee !== null || 'assigneeUserId' in set ? 'assigned' : 'updated',
      {
        fields: Object.keys(set),
      },
    );
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'task.updated',
      entityType: 'task',
      entityId: id,
      metadata: { fields: Object.keys(set) },
      ip: ctx.ip,
    });
  });
  if (newAssignee && newAssignee !== ctx.userId)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: newAssignee,
      type: 'task_assigned',
      title: `Tarefa atribuída a você: ${t.title}`,
      link: `/tarefas/${id}`,
    });
  return { id };
}

export async function setTaskStatus(db: Db, ctx: Ctx, id: string, to: TaskStatus, reason?: string) {
  const t = await loadTask(db, ctx, id, 'tasks:edit');
  if (t.status === to) return { id, status: to };
  if (to === 'blocked' && !reason?.trim())
    throw new AppError('VALIDATION', 'Informe o motivo do bloqueio.', {
      reason: ['Informe o motivo do bloqueio.'],
    });
  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({
        status: to,
        blockedReason: to === 'blocked' ? reason!.trim() : null,
        completedAt: to === 'done' ? new Date() : null,
      })
      .where(eq(tasks.id, id));
    await event(tx, ctx, id, 'status_changed', { from: t.status, to, reason: reason ?? null });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'task.status_changed',
      entityType: 'task',
      entityId: id,
      metadata: { from: t.status, to },
      ip: ctx.ip,
    });
  });
  if (t.createdBy && t.createdBy !== ctx.userId && (to === 'done' || to === 'blocked'))
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: t.createdBy,
      type: 'task_status',
      title: `Tarefa ${TASK_STATUS_LABELS[to].toLowerCase()}: ${t.title}`,
      link: `/tarefas/${id}`,
    });
  return { id, status: to };
}

export async function deleteTask(db: Db, ctx: Ctx, id: string) {
  const t = await loadTask(db, ctx, id, 'tasks:delete');
  await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'task.deleted',
    entityType: 'task',
    entityId: id,
    metadata: { title: t.title },
    ip: ctx.ip,
  });
}

export interface TaskFilters {
  clientId?: string;
  projectId?: string;
  contentId?: string;
  status?: string;
  assignee?: string;
  priority?: string;
  overdue?: boolean;
  q?: string;
  before?: string;
  limit?: number;
}

export async function listTasks(db: Db, ctx: Ctx, f: TaskFilters = {}, now = new Date()) {
  internalOnly(ctx);
  requireAnyScope(ctx, 'tasks:view');
  const where: (SQL | undefined)[] = [visibleTasks(ctx)];
  if (f.clientId) where.push(eq(tasks.clientId, f.clientId));
  if (f.projectId) where.push(eq(tasks.projectId, f.projectId));
  if (f.contentId) where.push(eq(tasks.contentId, f.contentId));
  if (f.status === 'open') where.push(inArray(tasks.status, OPEN_TASK_STATUSES));
  else if (f.status === 'closed') where.push(inArray(tasks.status, CLOSED_TASK_STATUSES));
  else if (f.status) where.push(eq(tasks.status, f.status as TaskStatus));
  if (f.assignee === 'me') where.push(eq(tasks.assigneeUserId, ctx.userId));
  else if (f.assignee === 'none') where.push(isNull(tasks.assigneeUserId));
  else if (f.assignee) where.push(eq(tasks.assigneeUserId, f.assignee));
  if (f.priority) where.push(eq(tasks.priority, f.priority as 'high'));
  if (f.overdue)
    where.push(lt(tasks.dueDate, todayIso(now)), inArray(tasks.status, OPEN_TASK_STATUSES));
  if (f.q)
    where.push(or(like(tasks.title, likePattern(f.q)), like(tasks.description, likePattern(f.q))));
  if (f.before) where.push(lt(tasks.id, f.before));
  const limit = Math.min(f.limit ?? TASKS_PAGE_SIZE, 500);
  const rows = await db
    .select({
      t: tasks,
      clientName: clients.name,
      assignee: users.name,
      projectName: projects.name,
    })
    .from(tasks)
    .leftJoin(clients, eq(clients.id, tasks.clientId))
    .leftJoin(users, eq(users.id, tasks.assigneeUserId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...where))
    .orderBy(
      sql`${tasks.dueDate} IS NULL`,
      asc(tasks.dueDate),
      sql`FIELD(${tasks.priority}, 'urgent','high','normal','low')`,
      desc(tasks.id),
    )
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const today = todayIso(now);
  return {
    items: page.map(({ t, clientName, assignee, projectName }) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      due: dueState(t.status, t.dueDate, today),
      clientId: t.clientId,
      clientName,
      projectId: t.projectId,
      projectName,
      contentId: t.contentId,
      assigneeUserId: t.assigneeUserId,
      assigneeName: assignee,
    })),
    nextBefore: rows.length > limit ? page[page.length - 1]!.t.id : null,
  };
}

export async function getTask(db: Db, ctx: Ctx, id: string, now = new Date()) {
  internalOnly(ctx);
  const t = await loadTask(db, ctx, id);
  const [[client], [project], [assignee], [content], checklist, comments, events] =
    await Promise.all([
      t.clientId
        ? db.select({ name: clients.name }).from(clients).where(eq(clients.id, t.clientId))
        : Promise.resolve([] as { name: string }[]),
      t.projectId
        ? db.select({ name: projects.name }).from(projects).where(eq(projects.id, t.projectId))
        : Promise.resolve([] as { name: string }[]),
      t.assigneeUserId
        ? db.select({ name: users.name }).from(users).where(eq(users.id, t.assigneeUserId))
        : Promise.resolve([] as { name: string }[]),
      t.contentId
        ? db
            .select({ number: contents.number, title: contents.title })
            .from(contents)
            .where(and(visibleContents(ctx), eq(contents.id, t.contentId)))
        : Promise.resolve([] as { number: number; title: string }[]),
      db
        .select()
        .from(taskChecklistItems)
        .where(eq(taskChecklistItems.taskId, id))
        .orderBy(asc(taskChecklistItems.position)),
      db
        .select({ c: taskComments, name: users.name })
        .from(taskComments)
        .leftJoin(users, eq(users.id, taskComments.authorId))
        .where(eq(taskComments.taskId, id))
        .orderBy(asc(taskComments.createdAt)),
      db
        .select({ e: taskEvents, name: users.name })
        .from(taskEvents)
        .leftJoin(users, eq(users.id, taskEvents.actorUserId))
        .where(eq(taskEvents.taskId, id))
        .orderBy(desc(taskEvents.createdAt))
        .limit(100),
    ]);
  const edit = permFor(ctx, 'tasks:edit', t.clientId);
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    due: dueState(t.status, t.dueDate, todayIso(now)),
    blockedReason: t.blockedReason,
    clientId: t.clientId,
    clientName: client?.name ?? null,
    projectId: t.projectId,
    projectName: project?.name ?? null,
    contentId: t.contentId,
    contentLabel: content ? `#${content.number} ${content.title}` : null,
    assigneeUserId: t.assigneeUserId,
    assigneeName: assignee?.name ?? null,
    completedAt: t.completedAt,
    createdAt: t.createdAt,
    checklist: checklist.map((i) => ({ id: i.id, text: i.text, done: i.done === 1 })),
    comments: comments.map(({ c, name }) => ({
      id: c.id,
      body: c.body,
      authorName: name,
      createdAt: c.createdAt,
    })),
    events: events.map(({ e, name }) => ({
      id: e.id,
      kind: e.kind,
      metadata: e.metadata,
      actorName: name,
      createdAt: e.createdAt,
    })),
    permissions: {
      edit,
      delete: permFor(ctx, 'tasks:delete', t.clientId),
      assign: permFor(ctx, 'tasks:assign', t.clientId),
    },
  };
}

export async function addComment(db: Db, ctx: Ctx, id: string, body: string) {
  const t = await loadTask(db, ctx, id);
  const cid = newId();
  await db.insert(taskComments).values({
    id: cid,
    organizationId: ctx.organizationId,
    taskId: id,
    authorId: ctx.userId,
    body,
  });
  await event(db, ctx, id, 'commented');
  if (t.assigneeUserId && t.assigneeUserId !== ctx.userId)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: t.assigneeUserId,
      type: 'task_comment',
      title: `Novo comentário na tarefa: ${t.title}`,
      link: `/tarefas/${id}`,
    });
  return { id: cid };
}

// ---------------------------------------------------------------- checklist
export async function addChecklistItem(db: Db, ctx: Ctx, id: string, text: string) {
  await loadTask(db, ctx, id, 'tasks:edit');
  const [m] = await db
    .select({ n: sql<number>`COALESCE(MAX(${taskChecklistItems.position}), 0)` })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id));
  if (Number(m?.n ?? 0) >= 60)
    throw new AppError('VALIDATION', 'Limite de itens do checklist atingido.');
  const iid = newId();
  await db.insert(taskChecklistItems).values({
    id: iid,
    organizationId: ctx.organizationId,
    taskId: id,
    text,
    position: Number(m?.n ?? 0) + 1,
  });
  return { id: iid };
}

export async function updateChecklistItem(
  db: Db,
  ctx: Ctx,
  id: string,
  itemId: string,
  patch: { text?: string; done?: boolean },
) {
  await loadTask(db, ctx, id, 'tasks:edit');
  const set: Record<string, unknown> = {};
  if (patch.text !== undefined) set.text = patch.text;
  if (patch.done !== undefined) set.done = patch.done ? 1 : 0;
  const [r] = await db
    .select({ id: taskChecklistItems.id })
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.taskId, id)));
  if (!r) throw nf('Item');
  if (Object.keys(set).length)
    await db.update(taskChecklistItems).set(set).where(eq(taskChecklistItems.id, itemId));
}

export async function deleteChecklistItem(db: Db, ctx: Ctx, id: string, itemId: string) {
  await loadTask(db, ctx, id, 'tasks:edit');
  const [r] = await db
    .select({ id: taskChecklistItems.id })
    .from(taskChecklistItems)
    .where(and(eq(taskChecklistItems.id, itemId), eq(taskChecklistItems.taskId, id)));
  if (!r) throw nf('Item');
  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, itemId));
}
