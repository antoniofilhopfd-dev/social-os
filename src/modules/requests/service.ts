import { and, asc, desc, eq, inArray, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  brands,
  clients,
  memberships,
  requestCounters,
  requestEvents,
  requestTypes,
  requests,
  rolePermissions,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import {
  can,
  canOrgWide,
  clientScope,
  requireAnyScope,
  requireCan,
  requireOrgWide,
  type Ctx,
} from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { assertInternalMember, likePattern } from '@/modules/clients/service';
import { notify } from '@/modules/notifications/service';
import type { CreateRequestInput, UpdateRequestInput } from './schema';
import {
  CONFIGURABLE_FIELDS,
  DEFAULT_TYPES,
  DUPLICATE_STATUSES,
  DUPLICATE_THRESHOLD,
  DUPLICATE_WINDOW_DAYS,
  MESSAGE_REQUIRED,
  OPEN_STATUSES,
  canTransition,
  missingFields,
  slaState,
  titleSimilarity,
  type ConfigurableField,
  type RequestStatus,
} from './rules';

export const REQUESTS_PAGE_SIZE = 25;
const nf = () => new AppError('NOT_FOUND', 'Solicitação não encontrada.');
const isInternal = (ctx: Ctx) => ctx.userKind === 'internal';

/** Condição base de TODA consulta de solicitações: organização + escopo de cliente do usuário. */
export function visibleRequests(ctx: Ctx) {
  const scope = clientScope(ctx, 'requests:view');
  const base = [eq(requests.organizationId, ctx.organizationId)];
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(requests.id, '__none__'));
  return and(...base, inArray(requests.clientId, scope.clientIds));
}

// -------------------------------------------------------------------- tipos
/** Garante os tipos padrão da organização (idempotente). Também chamado no bootstrap. */
export async function ensureDefaultRequestTypes(db: Db, organizationId: string): Promise<void> {
  const [any] = await db
    .select({ id: requestTypes.id })
    .from(requestTypes)
    .where(eq(requestTypes.organizationId, organizationId))
    .limit(1);
  if (any) return;
  await db
    .insert(requestTypes)
    .values(
      DEFAULT_TYPES.map((t) => ({
        id: newId(),
        organizationId,
        name: t.name,
        requiredFields: t.required,
      })),
    )
    .catch(() => undefined);
}

export async function listRequestTypes(db: Db, ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  requireAnyScope(ctx, 'requests:view');
  await ensureDefaultRequestTypes(db, ctx.organizationId);
  const where = [eq(requestTypes.organizationId, ctx.organizationId)];
  if (!(opts.includeInactive && canOrgWide(ctx, 'settings:view')))
    where.push(eq(requestTypes.active, 1));
  return (
    await db
      .select()
      .from(requestTypes)
      .where(and(...where))
      .orderBy(requestTypes.name)
  ).map((t) => ({
    id: t.id,
    name: t.name,
    requiredFields: t.requiredFields,
    active: t.active === 1,
  }));
}

export async function saveRequestType(
  db: Db,
  ctx: Ctx,
  id: string | null,
  input: { name: string; requiredFields: string[]; active?: boolean },
) {
  requireOrgWide(ctx, 'settings:edit');
  const fields = [...new Set(input.requiredFields)];
  const typeId = id ?? newId();
  try {
    if (id) {
      const [t] = await db
        .select({ id: requestTypes.id })
        .from(requestTypes)
        .where(and(eq(requestTypes.id, id), eq(requestTypes.organizationId, ctx.organizationId)));
      if (!t) throw new AppError('NOT_FOUND', 'Tipo não encontrado.');
      await db
        .update(requestTypes)
        .set({ name: input.name, requiredFields: fields, active: input.active === false ? 0 : 1 })
        .where(eq(requestTypes.id, id));
    } else {
      await db.insert(requestTypes).values({
        id: typeId,
        organizationId: ctx.organizationId,
        name: input.name,
        requiredFields: fields,
        active: input.active === false ? 0 : 1,
      });
    }
  } catch (e) {
    if (
      (e as { cause?: { code?: string }; code?: string }).cause?.code === 'ER_DUP_ENTRY' ||
      (e as { code?: string }).code === 'ER_DUP_ENTRY'
    ) {
      throw new AppError('CONFLICT', 'Já existe um tipo com este nome.');
    }
    throw e;
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: id ? 'request_type.updated' : 'request_type.created',
    entityType: 'request_type',
    entityId: typeId,
    metadata: { name: input.name, requiredFields: fields },
    ip: ctx.ip,
  });
  return { id: typeId };
}

// ----------------------------------------------------------------- consulta
interface ListFilters {
  status?: RequestStatus | 'open';
  priority?: string;
  clientId?: string;
  assignee?: string; // id | 'me' | 'none'
  overdue?: boolean;
  q?: string;
  before?: string;
  limit?: number;
}

export async function listRequests(db: Db, ctx: Ctx, f: ListFilters = {}, now = new Date()) {
  requireAnyScope(ctx, 'requests:view');
  const where: (SQL | undefined)[] = [visibleRequests(ctx)];
  if (f.status === 'open') where.push(inArray(requests.status, OPEN_STATUSES));
  else if (f.status) where.push(eq(requests.status, f.status));
  if (f.priority) where.push(eq(requests.priority, f.priority as 'low'));
  if (f.clientId) where.push(eq(requests.clientId, f.clientId));
  if (f.assignee === 'me') where.push(eq(requests.assigneeUserId, ctx.userId));
  else if (f.assignee === 'none') where.push(isNull(requests.assigneeUserId));
  else if (f.assignee) where.push(eq(requests.assigneeUserId, f.assignee));
  if (f.before) where.push(lt(requests.id, f.before));
  if (f.q?.trim()) {
    const q = f.q.trim().replace(/^#/, '');
    where.push(
      /^\d+$/.test(q)
        ? or(eq(requests.number, Number(q)), like(requests.title, likePattern(q)))
        : like(requests.title, likePattern(q)),
    );
  }
  if (f.overdue) {
    const today = now.toISOString().slice(0, 10);
    where.push(
      or(
        and(
          eq(requests.status, 'new'),
          isNull(requests.firstResponseAt),
          lt(requests.firstResponseDueAt, now),
        ),
        and(inArray(requests.status, OPEN_STATUSES), lt(requests.estimatedDue, today)),
      ),
    );
  }
  const limit = f.limit ?? REQUESTS_PAGE_SIZE;
  const rows = await db
    .select({ r: requests, clientName: clients.name, assigneeName: users.name })
    .from(requests)
    .innerJoin(clients, eq(clients.id, requests.clientId))
    .leftJoin(users, eq(users.id, requests.assigneeUserId))
    .where(and(...where))
    .orderBy(desc(requests.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(({ r, clientName, assigneeName }) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    status: r.status,
    priority: r.priority,
    clientId: r.clientId,
    clientName,
    assigneeName,
    desiredDate: r.desiredDate,
    estimatedDue: r.estimatedDue,
    createdAt: r.createdAt,
    sla: slaState(r, now),
  }));
  return { items, nextBefore: hasMore ? items[items.length - 1]!.id : null };
}

export async function getRequest(db: Db, ctx: Ctx, id: string, now = new Date()) {
  requireAnyScope(ctx, 'requests:view');
  const [row] = await db
    .select({
      r: requests,
      clientName: clients.name,
      brandName: brands.name,
      assigneeName: users.name,
      typeName: requestTypes.name,
      typeRequired: requestTypes.requiredFields,
    })
    .from(requests)
    .innerJoin(clients, eq(clients.id, requests.clientId))
    .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId))
    .leftJoin(brands, eq(brands.id, requests.brandId))
    .leftJoin(users, eq(users.id, requests.assigneeUserId))
    .where(and(visibleRequests(ctx), eq(requests.id, id)))
    .limit(1);
  if (!row) throw nf();
  const internal = isInternal(ctx);
  const evWhere = [
    eq(requestEvents.requestId, id),
    eq(requestEvents.organizationId, ctx.organizationId),
  ];
  if (!internal) evWhere.push(eq(requestEvents.internalOnly, 0)); // externos nunca veem notas internas
  const events = await db
    .select({ e: requestEvents, actorName: users.name })
    .from(requestEvents)
    .leftJoin(users, eq(users.id, requestEvents.actorUserId))
    .where(and(...evWhere))
    .orderBy(asc(requestEvents.id));
  const { r } = row;
  return {
    id: r.id,
    number: r.number,
    clientId: r.clientId,
    clientName: row.clientName,
    brandId: r.brandId,
    brandName: row.brandName,
    typeId: r.typeId,
    typeName: row.typeName,
    typeRequired: row.typeRequired,
    requesterName: r.requesterName,
    title: r.title,
    description: r.description,
    objective: r.objective,
    audience: r.audience,
    network: r.network,
    format: r.format,
    desiredDate: r.desiredDate,
    referenceNotes: r.referenceNotes,
    approvalRequired: r.approvalRequired === 1,
    priority: r.priority,
    originalPriority: r.originalPriority,
    urgencyReason: r.urgencyReason,
    status: r.status,
    assigneeUserId: r.assigneeUserId,
    assigneeName: row.assigneeName,
    estimatedDue: r.estimatedDue,
    firstResponseDueAt: r.firstResponseDueAt,
    firstResponseAt: r.firstResponseAt,
    possibleDuplicateOf: r.possibleDuplicateOf,
    createdAt: r.createdAt,
    closedAt: r.closedAt,
    sla: slaState(r, now),
    missing: missingFields(r as never, row.typeRequired),
    permissions: {
      edit: can(ctx, 'requests:edit', r.clientId),
      assign: can(ctx, 'requests:assign', r.clientId),
      comment: true,
    },
    events: events.map(({ e, actorName }) => ({
      id: e.id,
      kind: e.kind,
      body: e.body,
      metadata: e.metadata,
      internalOnly: e.internalOnly === 1,
      createdAt: e.createdAt,
      actorName,
    })),
  };
}

// ------------------------------------------------------------------ criação
async function nextNumber(
  tx: Pick<Db, 'insert' | 'select'>,
  organizationId: string,
): Promise<number> {
  await tx
    .insert(requestCounters)
    .values({ organizationId, lastNumber: 1 })
    .onDuplicateKeyUpdate({ set: { lastNumber: sql`${requestCounters.lastNumber} + 1` } });
  const [row] = await tx
    .select({ n: requestCounters.lastNumber })
    .from(requestCounters)
    .where(eq(requestCounters.organizationId, organizationId))
    .for('update');
  return row!.n;
}

async function findDuplicates(db: Db, ctx: Ctx, clientId: string, title: string, now: Date) {
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 86_400_000);
  const rows = await db
    .select({ id: requests.id, number: requests.number, title: requests.title })
    .from(requests)
    .where(
      and(
        eq(requests.organizationId, ctx.organizationId),
        eq(requests.clientId, clientId),
        inArray(requests.status, DUPLICATE_STATUSES),
        sql`${requests.createdAt} >= ${since}`,
      ),
    )
    .orderBy(desc(requests.id))
    .limit(200);
  return rows.filter((r) => titleSimilarity(r.title, title) >= DUPLICATE_THRESHOLD).slice(0, 5);
}

async function requestersToNotify(
  db: Db,
  organizationId: string,
  permission: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.scopeType, 'organization'),
        eq(rolePermissions.permissionCode, permission),
      ),
    )
    .limit(30);
  return rows.map((r) => r.userId);
}

async function event(
  tx: Pick<Db, 'insert'>,
  ctx: Ctx,
  requestId: string,
  kind: typeof requestEvents.$inferInsert.kind,
  data: { body?: string | null; metadata?: Record<string, unknown>; internalOnly?: boolean } = {},
) {
  await tx.insert(requestEvents).values({
    id: newId(),
    organizationId: ctx.organizationId,
    requestId,
    actorUserId: ctx.userId,
    kind,
    body: data.body ?? null,
    metadata: data.metadata ?? null,
    internalOnly: data.internalOnly ? 1 : 0,
  });
}

export async function createRequest(db: Db, ctx: Ctx, input: CreateRequestInput, now = new Date()) {
  requireCan(ctx, 'requests:create', input.clientId);
  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.id, input.clientId),
        eq(clients.organizationId, ctx.organizationId),
        isNull(clients.deletedAt),
      ),
    );
  // Cliente fora do escopo = inexistente (não confirma existência)
  if (!client || !clientScopeAllows(ctx, input.clientId))
    throw new AppError('NOT_FOUND', 'Cliente não encontrado.');
  if (client.status !== 'active')
    throw new AppError('VALIDATION', 'Este cliente está inativo.', {
      clientId: ['Cliente inativo.'],
    });

  const [type] = await db
    .select()
    .from(requestTypes)
    .where(
      and(
        eq(requestTypes.id, input.typeId),
        eq(requestTypes.organizationId, ctx.organizationId),
        eq(requestTypes.active, 1),
      ),
    );
  if (!type)
    throw new AppError('VALIDATION', 'Tipo de solicitação inválido.', {
      typeId: ['Escolha um tipo disponível.'],
    });

  if (input.brandId) {
    const [b] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, input.brandId),
          eq(brands.clientId, input.clientId),
          eq(brands.organizationId, ctx.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!b)
      throw new AppError('VALIDATION', 'Marca inválida para este cliente.', {
        brandId: ['Escolha uma marca do cliente.'],
      });
  }
  const missing = missingFields(input as never, type.requiredFields);
  if (missing.length) {
    throw new AppError(
      'VALIDATION',
      'Preencha os campos obrigatórios deste tipo de solicitação.',
      Object.fromEntries(
        missing.map((k) => [k, [`${CONFIGURABLE_FIELDS[k]} é obrigatório para este tipo.`]]),
      ),
    );
  }
  const priority = input.priority ?? 'normal';
  if (priority === 'urgent' && !input.urgencyReason?.trim()) {
    throw new AppError('VALIDATION', 'Informe a justificativa da urgência.', {
      urgencyReason: ['A justificativa é obrigatória para solicitações urgentes.'],
    });
  }

  const dups = await findDuplicates(db, ctx, input.clientId, input.title, now);
  if (dups.length && !input.force) {
    throw new AppError(
      'CONFLICT',
      'Encontramos solicitações parecidas em aberto. Confirme se a nova solicitação é diferente.',
      {
        duplicates: dups.map((d) => `#${d.number} · ${d.title}`),
      },
    );
  }

  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, ctx.userId));
  const id = newId();
  const dueAt = client.slaResponseHours
    ? new Date(now.getTime() + client.slaResponseHours * 3_600_000)
    : null;
  const number = await db.transaction(async (tx) => {
    const n = await nextNumber(tx as unknown as Db, ctx.organizationId);
    await tx.insert(requests).values({
      id,
      organizationId: ctx.organizationId,
      number: n,
      clientId: input.clientId,
      brandId: input.brandId ?? null,
      typeId: type.id,
      requesterUserId: ctx.userId,
      requesterName: (input.requesterName?.trim() || me?.name || 'Solicitante').slice(0, 190),
      title: input.title,
      description: input.description,
      objective: input.objective ?? null,
      audience: input.audience ?? null,
      network: input.network ?? null,
      format: input.format ?? null,
      desiredDate: input.desiredDate ?? null,
      referenceNotes: input.referenceNotes ?? null,
      approvalRequired: input.approvalRequired === false ? 0 : 1,
      priority,
      originalPriority: priority,
      urgencyReason: input.urgencyReason ?? null,
      firstResponseDueAt: dueAt,
      possibleDuplicateOf: dups.length ? dups[0]!.id : null,
    });
    await event(tx, ctx, id, 'created', {
      metadata: { priority, possibleDuplicateOf: dups[0]?.id ?? null },
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'request.created',
      entityType: 'request',
      entityId: id,
      metadata: { number: n, clientId: input.clientId },
      ip: ctx.ip,
    });
    return n;
  });

  for (const userId of (await requestersToNotify(db, ctx.organizationId, 'requests:assign')).filter(
    (u) => u !== ctx.userId,
  )) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId,
      type: 'request_created',
      title: `Nova solicitação #${number}: ${input.title}`.slice(0, 190),
      body: `Cliente: ${client.name}`,
      link: `/solicitacoes/${id}`,
    });
  }
  return { id, number };
}

function clientScopeAllows(ctx: Ctx, clientId: string): boolean {
  const s = clientScope(ctx, 'requests:view');
  return s.all || s.clientIds.includes(clientId);
}

// ------------------------------------------------------------------ edição
async function loadForWrite(db: Db, ctx: Ctx, id: string, perm: string) {
  const [r] = await db
    .select()
    .from(requests)
    .where(and(visibleRequests(ctx), eq(requests.id, id)))
    .limit(1);
  if (!r) throw nf();
  requireCan(ctx, perm, r.clientId);
  return r;
}

const EDITABLE = [
  'title',
  'description',
  'brandId',
  'objective',
  'audience',
  'network',
  'format',
  'desiredDate',
  'referenceNotes',
  'approvalRequired',
  'urgencyReason',
  'typeId',
] as const;

export async function updateRequest(db: Db, ctx: Ctx, id: string, patch: UpdateRequestInput) {
  const r = await loadForWrite(db, ctx, id, 'requests:edit');
  if (['rejected', 'cancelled'].includes(r.status))
    throw new AppError('CONFLICT', 'Reabra a solicitação antes de editá-la.');
  const set: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of EDITABLE) {
    if (!(f in patch)) continue;
    let next: unknown = (patch as Record<string, unknown>)[f] ?? null;
    if (f === 'approvalRequired') next = next ? 1 : 0;
    const prev = (r as Record<string, unknown>)[f] ?? null;
    if (next !== prev) {
      set[f] = next;
      changes[f] = {
        from: typeof prev === 'string' ? prev.slice(0, 120) : prev,
        to: typeof next === 'string' ? next.slice(0, 120) : next,
      };
    }
  }
  if (patch.brandId) {
    const [b] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, patch.brandId),
          eq(brands.clientId, r.clientId),
          eq(brands.organizationId, ctx.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!b)
      throw new AppError('VALIDATION', 'Marca inválida para este cliente.', {
        brandId: ['Escolha uma marca do cliente.'],
      });
  }
  if (patch.typeId) {
    const [t] = await db
      .select({ id: requestTypes.id })
      .from(requestTypes)
      .where(
        and(
          eq(requestTypes.id, patch.typeId),
          eq(requestTypes.organizationId, ctx.organizationId),
          eq(requestTypes.active, 1),
        ),
      );
    if (!t)
      throw new AppError('VALIDATION', 'Tipo de solicitação inválido.', {
        typeId: ['Escolha um tipo disponível.'],
      });
  }
  const priorityChanged = patch.priority !== undefined && patch.priority !== r.priority;
  if (priorityChanged) {
    const reason = ('urgencyReason' in patch ? patch.urgencyReason : r.urgencyReason) ?? null;
    if (patch.priority === 'urgent' && !reason?.toString().trim()) {
      throw new AppError('VALIDATION', 'Informe a justificativa da urgência.', {
        urgencyReason: ['A justificativa é obrigatória para solicitações urgentes.'],
      });
    }
    set.priority = patch.priority; // original_priority nunca muda: o registro original é preservado
  }
  if (Object.keys(set).length === 0) return;
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set(set)
      .where(and(eq(requests.id, id), eq(requests.organizationId, ctx.organizationId)));
    if (Object.keys(changes).length)
      await event(tx, ctx, id, 'updated', { metadata: { changes }, internalOnly: false });
    if (priorityChanged)
      await event(tx, ctx, id, 'priority_changed', {
        metadata: { from: r.priority, to: patch.priority, original: r.originalPriority },
      });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'request.updated',
      entityType: 'request',
      entityId: id,
      metadata: { fields: Object.keys(set) },
      ip: ctx.ip,
    });
  });
}

// ------------------------------------------------------------------- status
export async function changeStatus(
  db: Db,
  ctx: Ctx,
  id: string,
  to: RequestStatus,
  message?: string,
  now = new Date(),
) {
  const r = await loadForWrite(db, ctx, id, 'requests:edit');
  if (!canTransition(r.status, to)) {
    throw new AppError('CONFLICT', `Não é possível mudar de “${r.status}” para “${to}”.`, {
      status: [`Transição não permitida.`],
    });
  }
  const text = message?.trim();
  if (MESSAGE_REQUIRED.includes(to) && !text) {
    throw new AppError('VALIDATION', 'Informe uma mensagem para esta mudança de situação.', {
      message: ['A mensagem é obrigatória.'],
    });
  }
  if (
    r.status !== 'new' &&
    ['rejected', 'cancelled'].includes(r.status) &&
    to === 'in_triage' &&
    !text
  ) {
    throw new AppError('VALIDATION', 'Informe o motivo da reabertura.', {
      message: ['O motivo é obrigatório.'],
    });
  }
  if (to === 'accepted') {
    // Demanda incompleta não avança em silêncio.
    const [type] = await db
      .select({ req: requestTypes.requiredFields })
      .from(requestTypes)
      .where(eq(requestTypes.id, r.typeId));
    const missing = missingFields(r as never, type?.req ?? []);
    const problems: Record<string, string[]> = Object.fromEntries(
      missing.map((k) => [k, [`${CONFIGURABLE_FIELDS[k as ConfigurableField]} está ausente.`]]),
    );
    if (!r.assigneeUserId) problems.assigneeUserId = ['Defina o responsável pelo atendimento.'];
    if (Object.keys(problems).length)
      throw new AppError(
        'VALIDATION',
        'A solicitação está incompleta e não pode ser aceita.',
        problems,
      );
  }
  const closing = to === 'rejected' || to === 'cancelled';
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set({
        status: to,
        firstResponseAt: r.firstResponseAt ?? (r.status === 'new' ? now : null),
        closedAt: closing ? now : null,
      })
      .where(and(eq(requests.id, id), eq(requests.organizationId, ctx.organizationId)));
    await event(tx, ctx, id, to === 'awaiting_info' ? 'info_requested' : 'status_changed', {
      body: text ?? null,
      metadata: { from: r.status, to },
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'request.status_changed',
      entityType: 'request',
      entityId: id,
      metadata: { from: r.status, to },
      ip: ctx.ip,
    });
  });
  if (r.requesterUserId && r.requesterUserId !== ctx.userId) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: r.requesterUserId,
      type: to === 'awaiting_info' ? 'request_info_requested' : 'request_status_changed',
      title:
        to === 'awaiting_info'
          ? `Precisamos de informações: #${r.number} ${r.title}`.slice(0, 190)
          : `Solicitação #${r.number}: situação atualizada`,
      body: text ?? undefined,
      link: `/solicitacoes/${id}`,
    });
  }
}

// ----------------------------------------------------------- atribuição/prazo
export async function assignRequest(
  db: Db,
  ctx: Ctx,
  id: string,
  assigneeUserId: string | null,
  estimatedDue?: string | null,
) {
  const r = await loadForWrite(db, ctx, id, 'requests:assign');
  if (['rejected', 'cancelled'].includes(r.status))
    throw new AppError('CONFLICT', 'Reabra a solicitação antes de atribuí-la.');
  if (assigneeUserId) await assertInternalMember(db, ctx.organizationId, assigneeUserId);
  const set: Record<string, unknown> = { assigneeUserId };
  if (estimatedDue !== undefined) set.estimatedDue = estimatedDue;
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set(set)
      .where(and(eq(requests.id, id), eq(requests.organizationId, ctx.organizationId)));
    await event(tx, ctx, id, 'assigned', {
      metadata: {
        from: r.assigneeUserId,
        to: assigneeUserId,
        estimatedDue: estimatedDue ?? r.estimatedDue,
      },
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'request.assigned',
      entityType: 'request',
      entityId: id,
      metadata: { to: assigneeUserId },
      ip: ctx.ip,
    });
  });
  if (assigneeUserId && assigneeUserId !== ctx.userId && assigneeUserId !== r.assigneeUserId) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: assigneeUserId,
      type: 'request_assigned',
      title: `Solicitação #${r.number} atribuída a você`,
      body: r.title,
      link: `/solicitacoes/${id}`,
    });
  }
}

export async function listAssignees(db: Db, ctx: Ctx) {
  requireOrgWide(ctx, 'requests:assign');
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

// -------------------------------------------------------------- comentários
export async function addComment(
  db: Db,
  ctx: Ctx,
  id: string,
  body: string,
  internalOnly = false,
  now = new Date(),
) {
  requireAnyScope(ctx, 'requests:view');
  const [r] = await db
    .select()
    .from(requests)
    .where(and(visibleRequests(ctx), eq(requests.id, id)))
    .limit(1);
  if (!r) throw nf();
  if (internalOnly && !isInternal(ctx))
    throw new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
  if (['rejected', 'cancelled'].includes(r.status))
    throw new AppError('CONFLICT', 'A solicitação está encerrada. Reabra-a para comentar.');
  const staff = can(ctx, 'requests:edit', r.clientId);
  // Resposta do lado do cliente a um pedido de informações devolve a solicitação à triagem.
  const providesInfo = !staff && !internalOnly && r.status === 'awaiting_info';
  await db.transaction(async (tx) => {
    await event(tx, ctx, id, providesInfo ? 'info_provided' : 'commented', { body, internalOnly });
    if (providesInfo)
      await tx.update(requests).set({ status: 'in_triage' }).where(eq(requests.id, id));
    if (staff && !internalOnly && !r.firstResponseAt)
      await tx.update(requests).set({ firstResponseAt: now }).where(eq(requests.id, id));
  });
  if (r.assigneeUserId && r.assigneeUserId !== ctx.userId && !internalOnly) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: r.assigneeUserId,
      type: 'request_info_provided',
      title: providesInfo
        ? `Informações enviadas: #${r.number} ${r.title}`.slice(0, 190)
        : `Novo comentário em #${r.number}`,
      body: body.slice(0, 200),
      link: `/solicitacoes/${id}`,
    });
  }
  return { statusChanged: providesInfo };
}
