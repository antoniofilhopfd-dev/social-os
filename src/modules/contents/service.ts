import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  like,
  lt,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '@/db';
import {
  brands,
  campaigns,
  clients,
  contentCounters,
  contentPillars,
  contents,
  requestEvents,
  requests,
  socialProfiles,
  users,
  auditLogs,
  memberships,
} from '@/db/schema';
import { audit } from '@/core/audit';
import {
  can,
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
import type { CreateContentInput, UpdateContentInput } from './schema';
import {
  CLIENT_VISIBLE_STATUSES,
  CLOSED_STATUSES,
  CONTENT_STATUS_LABELS,
  NON_DELETABLE_STATUSES,
  RESERVED_STATUSES,
  canTransitionManually,
  formatFromRequest,
  isoDate,
  scheduleState,
  type ContentStatus,
} from './rules';

export const CONTENTS_PAGE_SIZE = 40;
const nf = () => new AppError('NOT_FOUND', 'Conteúdo não encontrado.');
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const isInternal = (ctx: Ctx) => ctx.userKind === 'internal';

/**
 * Condição base de TODA consulta de conteúdos: organização + escopo de cliente + não excluído.
 * Externos só veem conteúdos já enviados ao cliente (nada interno vaza antes da aprovação).
 */
export function visibleContents(ctx: Ctx) {
  const scope = clientScope(ctx, 'contents:view');
  const base: (SQL | undefined)[] = [
    eq(contents.organizationId, ctx.organizationId),
    isNull(contents.deletedAt),
  ];
  if (!isInternal(ctx)) base.push(inArray(contents.status, CLIENT_VISIBLE_STATUSES));
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(contents.id, '__none__'));
  return and(...base, inArray(contents.clientId, scope.clientIds));
}

// ----------------------------------------------------------------- pilares
export async function listPillars(db: Db, ctx: Ctx, opts: { includeInactive?: boolean } = {}) {
  requireAnyScope(ctx, 'contents:view');
  const where = [eq(contentPillars.organizationId, ctx.organizationId)];
  if (!opts.includeInactive) where.push(eq(contentPillars.active, 1));
  const rows = await db
    .select()
    .from(contentPillars)
    .where(and(...where))
    .orderBy(contentPillars.name);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    description: p.description,
    active: p.active === 1,
  }));
}

export async function savePillar(
  db: Db,
  ctx: Ctx,
  id: string | null,
  input: { name: string; color: string; description?: string | null; active?: boolean },
) {
  requireOrgWide(ctx, 'settings:edit');
  const pid = id ?? newId();
  try {
    if (id) {
      const [p] = await db
        .select({ id: contentPillars.id })
        .from(contentPillars)
        .where(
          and(eq(contentPillars.id, id), eq(contentPillars.organizationId, ctx.organizationId)),
        );
      if (!p) throw new AppError('NOT_FOUND', 'Pilar não encontrado.');
      await db
        .update(contentPillars)
        .set({
          name: input.name,
          color: input.color,
          description: input.description ?? null,
          active: input.active === false ? 0 : 1,
        })
        .where(eq(contentPillars.id, id));
    } else {
      await db.insert(contentPillars).values({
        id: pid,
        organizationId: ctx.organizationId,
        name: input.name,
        color: input.color,
        description: input.description ?? null,
        active: input.active === false ? 0 : 1,
      });
    }
  } catch (e) {
    if (
      (e as { code?: string; cause?: { code?: string } }).code === 'ER_DUP_ENTRY' ||
      (e as { cause?: { code?: string } }).cause?.code === 'ER_DUP_ENTRY'
    ) {
      throw new AppError('CONFLICT', 'Já existe um pilar com este nome.');
    }
    throw e;
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: id ? 'pillar.updated' : 'pillar.created',
    entityType: 'pillar',
    entityId: pid,
    metadata: { name: input.name },
    ip: ctx.ip,
  });
  return { id: pid };
}

// ----------------------------------------------------------------- consulta
export interface ContentFiltersInput {
  clientId?: string;
  brandId?: string;
  network?: string;
  format?: string;
  status?: ContentStatus | 'open';
  assignee?: string;
  pillarId?: string;
  campaignId?: string;
  q?: string;
  before?: string;
  overdue?: boolean;
  includeArchived?: boolean;
  from?: string;
  to?: string;
  unscheduledOnly?: boolean;
  limit?: number;
}

function filterConditions(ctx: Ctx, f: ContentFiltersInput, today: string): (SQL | undefined)[] {
  const where: (SQL | undefined)[] = [visibleContents(ctx)];
  if (f.clientId) where.push(eq(contents.clientId, f.clientId));
  if (f.brandId) where.push(eq(contents.brandId, f.brandId));
  if (f.network) where.push(eq(socialProfiles.network, f.network as 'instagram'));
  if (f.format) where.push(eq(contents.format, f.format as 'carousel'));
  if (f.pillarId) where.push(eq(contents.pillarId, f.pillarId));
  if (f.campaignId) where.push(eq(contents.campaignId, f.campaignId));
  if (f.status === 'open') where.push(notInArray(contents.status, CLOSED_STATUSES));
  else if (f.status) where.push(eq(contents.status, f.status));
  else if (!f.includeArchived) where.push(notInArray(contents.status, ['archived']));
  if (f.assignee === 'me') where.push(eq(contents.assigneeUserId, ctx.userId));
  else if (f.assignee === 'none') where.push(isNull(contents.assigneeUserId));
  else if (f.assignee) where.push(eq(contents.assigneeUserId, f.assignee));
  if (f.from) where.push(sql`${contents.scheduledDate} >= ${f.from}`);
  if (f.to) where.push(sql`${contents.scheduledDate} <= ${f.to}`);
  if (f.unscheduledOnly) where.push(isNull(contents.scheduledDate));
  if (f.before) where.push(lt(contents.id, f.before));
  if (f.overdue)
    where.push(
      and(sql`${contents.scheduledDate} < ${today}`, notInArray(contents.status, CLOSED_STATUSES)),
    );
  if (f.q?.trim()) {
    const q = f.q.trim().replace(/^#/, '');
    where.push(
      /^\d+$/.test(q)
        ? or(eq(contents.number, Number(q)), like(contents.title, likePattern(q)))
        : or(like(contents.title, likePattern(q)), like(contents.theme, likePattern(q))),
    );
  }
  return where;
}

/** Base única das cinco visões: calendário, semana, agenda, lista e Kanban usam estes mesmos registros. */
export async function listContents(
  db: Db,
  ctx: Ctx,
  f: ContentFiltersInput = {},
  now = new Date(),
) {
  requireAnyScope(ctx, 'contents:view');
  const today = isoDate(now);
  const limit = f.limit ?? CONTENTS_PAGE_SIZE;
  const rows = await db
    .select({
      c: contents,
      clientName: clients.name,
      brandName: brands.name,
      profileNetwork: socialProfiles.network,
      profileHandle: socialProfiles.handle,
      pillarName: contentPillars.name,
      pillarColor: contentPillars.color,
      assigneeName: users.name,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(brands, eq(brands.id, contents.brandId))
    .leftJoin(socialProfiles, eq(socialProfiles.id, contents.socialProfileId))
    .leftJoin(contentPillars, eq(contentPillars.id, contents.pillarId))
    .leftJoin(users, eq(users.id, contents.assigneeUserId))
    .where(and(...filterConditions(ctx, f, today)))
    .orderBy(
      f.from || f.to ? asc(contents.scheduledDate) : desc(contents.id),
      asc(contents.scheduledTime),
      asc(contents.id),
    )
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.c.id,
    number: r.c.number,
    title: r.c.title,
    format: r.c.format,
    status: r.c.status,
    priority: r.c.priority,
    clientId: r.c.clientId,
    clientName: r.clientName,
    brandName: r.brandName,
    network: r.profileNetwork,
    profileHandle: r.profileHandle,
    pillarName: r.pillarName,
    pillarColor: r.pillarColor,
    assigneeName: isInternal(ctx) ? r.assigneeName : null,
    assigneeUserId: isInternal(ctx) ? r.c.assigneeUserId : null,
    scheduledDate: r.c.scheduledDate,
    scheduledTime: r.c.scheduledTime?.slice(0, 5) ?? null,
    schedule: scheduleState({ status: r.c.status, scheduledDate: r.c.scheduledDate }, today),
  }));
  return { items, nextBefore: hasMore ? items[items.length - 1]!.id : null };
}

export async function getContent(db: Db, ctx: Ctx, id: string, now = new Date()) {
  requireAnyScope(ctx, 'contents:view');
  const [row] = await db
    .select({
      c: contents,
      clientName: clients.name,
      brandName: brands.name,
      profileNetwork: socialProfiles.network,
      profileHandle: socialProfiles.handle,
      profileName: socialProfiles.profileName,
      pillarName: contentPillars.name,
      campaignName: campaigns.name,
      assigneeName: users.name,
    })
    .from(contents)
    .innerJoin(clients, eq(clients.id, contents.clientId))
    .leftJoin(brands, eq(brands.id, contents.brandId))
    .leftJoin(socialProfiles, eq(socialProfiles.id, contents.socialProfileId))
    .leftJoin(contentPillars, eq(contentPillars.id, contents.pillarId))
    .leftJoin(campaigns, eq(campaigns.id, contents.campaignId))
    .leftJoin(users, eq(users.id, contents.assigneeUserId))
    .where(and(visibleContents(ctx), eq(contents.id, id)))
    .limit(1);
  if (!row) throw nf();
  const c = row.c;
  const conflicts = isInternal(ctx)
    ? await findConflicts(db, ctx, c.socialProfileId, c.scheduledDate, c.scheduledTime, c.id)
    : [];
  return {
    id: c.id,
    number: c.number,
    clientId: c.clientId,
    clientName: row.clientName,
    brandId: c.brandId,
    brandName: row.brandName,
    socialProfileId: c.socialProfileId,
    profileLabel: row.profileNetwork ? `${row.profileName} (@${row.profileHandle})` : null,
    network: row.profileNetwork,
    pillarId: c.pillarId,
    pillarName: row.pillarName,
    campaignId: c.campaignId,
    campaignName: row.campaignName,
    requestId: c.requestId,
    title: c.title,
    theme: c.theme,
    objective: c.objective,
    audience: c.audience,
    format: c.format,
    // briefing e responsável são internos: o cliente vê o conteúdo pelo portal de aprovações
    brief: isInternal(ctx) ? c.brief : null,
    scheduledDate: c.scheduledDate,
    scheduledTime: c.scheduledTime?.slice(0, 5) ?? null,
    assigneeUserId: isInternal(ctx) ? c.assigneeUserId : null,
    assigneeName: isInternal(ctx) ? row.assigneeName : null,
    priority: c.priority,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    schedule: scheduleState({ status: c.status, scheduledDate: c.scheduledDate }, isoDate(now)),
    conflicts,
    permissions: {
      edit: can(ctx, 'contents:edit', c.clientId) && isInternal(ctx),
      assign: can(ctx, 'contents:assign', c.clientId),
      delete: can(ctx, 'contents:delete', c.clientId),
      create: can(ctx, 'contents:create', c.clientId),
    },
  };
}

/** Conflito de agenda: outro conteúdo ativo no mesmo perfil, no mesmo dia (e mesmo horário, se ambos tiverem). Só alerta; não bloqueia. */
export async function findConflicts(
  db: Db,
  ctx: Ctx,
  profileId: string | null,
  date: string | null,
  time: string | null,
  exceptId?: string,
) {
  if (!profileId || !date) return [];
  const rows = await db
    .select({
      id: contents.id,
      number: contents.number,
      title: contents.title,
      time: contents.scheduledTime,
    })
    .from(contents)
    .where(
      and(
        eq(contents.organizationId, ctx.organizationId),
        eq(contents.socialProfileId, profileId),
        eq(contents.scheduledDate, date),
        isNull(contents.deletedAt),
        notInArray(contents.status, ['cancelled', 'archived']),
      ),
    );
  return rows
    .filter(
      (r) => r.id !== exceptId && (!time || !r.time || r.time.slice(0, 5) === time.slice(0, 5)),
    )
    .map((r) => ({
      id: r.id,
      number: r.number,
      title: r.title,
      time: r.time?.slice(0, 5) ?? null,
    }));
}

// --------------------------------------------------------------- referências
async function resolveRefs(
  db: Db,
  ctx: Ctx,
  clientId: string,
  input: {
    brandId?: string | null;
    socialProfileId?: string | null;
    pillarId?: string | null;
    campaignId?: string | null;
    assigneeUserId?: string | null;
  },
) {
  let brandId = input.brandId ?? null;
  const profileId = input.socialProfileId ?? null;
  if (brandId) {
    const [b] = await db
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.clientId, clientId),
          eq(brands.organizationId, ctx.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!b)
      throw new AppError('VALIDATION', 'Marca inválida para este cliente.', {
        brandId: ['Escolha uma marca do cliente.'],
      });
  }
  if (profileId) {
    const [p] = await db
      .select({
        id: socialProfiles.id,
        brandId: socialProfiles.brandId,
        status: socialProfiles.status,
      })
      .from(socialProfiles)
      .innerJoin(brands, eq(brands.id, socialProfiles.brandId))
      .where(
        and(
          eq(socialProfiles.id, profileId),
          eq(brands.clientId, clientId),
          eq(socialProfiles.organizationId, ctx.organizationId),
          isNull(socialProfiles.deletedAt),
          isNull(brands.deletedAt),
        ),
      );
    if (!p)
      throw new AppError('VALIDATION', 'Perfil inválido para este cliente.', {
        socialProfileId: ['Escolha um perfil do cliente.'],
      });
    if (brandId && brandId !== p.brandId)
      throw new AppError('VALIDATION', 'O perfil não pertence à marca escolhida.', {
        socialProfileId: ['Perfil de outra marca.'],
      });
    brandId = p.brandId;
  }
  if (input.pillarId) {
    const [p] = await db
      .select({ id: contentPillars.id })
      .from(contentPillars)
      .where(
        and(
          eq(contentPillars.id, input.pillarId),
          eq(contentPillars.organizationId, ctx.organizationId),
          eq(contentPillars.active, 1),
        ),
      );
    if (!p)
      throw new AppError('VALIDATION', 'Pilar inválido.', {
        pillarId: ['Escolha um pilar ativo.'],
      });
  }
  if (input.campaignId) {
    const [c] = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.id, input.campaignId),
          eq(campaigns.clientId, clientId),
          eq(campaigns.organizationId, ctx.organizationId),
          isNull(campaigns.deletedAt),
        ),
      );
    if (!c)
      throw new AppError('VALIDATION', 'Campanha inválida para este cliente.', {
        campaignId: ['Escolha uma campanha do cliente.'],
      });
  }
  if (input.assigneeUserId)
    await assertInternalMember(db, ctx.organizationId, input.assigneeUserId).catch(() => {
      throw new AppError('VALIDATION', 'Responsável inválido.', {
        assigneeUserId: ['Escolha uma pessoa interna da equipe.'],
      });
    });
  return { brandId };
}

function assertCanAssign(
  ctx: Ctx,
  clientId: string,
  current: string | null,
  next: string | null | undefined,
) {
  if (next === undefined || next === current) return;
  // Atribuir a outra pessoa exige contents:assign; assumir para si, quando vazio, é permitido a quem edita.
  const selfPickup = next === ctx.userId && current === null;
  if (!selfPickup && !can(ctx, 'contents:assign', clientId)) throw forbidden();
}

async function nextNumber(
  tx: Pick<Db, 'insert' | 'select'>,
  organizationId: string,
): Promise<number> {
  await tx
    .insert(contentCounters)
    .values({ organizationId, lastNumber: 1 })
    .onDuplicateKeyUpdate({ set: { lastNumber: sql`${contentCounters.lastNumber} + 1` } });
  const [row] = await tx
    .select({ n: contentCounters.lastNumber })
    .from(contentCounters)
    .where(eq(contentCounters.organizationId, organizationId))
    .for('update');
  return row!.n;
}

// -------------------------------------------------------------------- criar
export async function createContent(db: Db, ctx: Ctx, input: CreateContentInput) {
  requireCan(ctx, 'contents:create', input.clientId);
  if (!isInternal(ctx)) throw forbidden();
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
  const scope = clientScope(ctx, 'contents:view');
  if (!client || !(scope.all || scope.clientIds.includes(input.clientId)))
    throw new AppError('NOT_FOUND', 'Cliente não encontrado.');
  if (client.status !== 'active')
    throw new AppError('VALIDATION', 'Este cliente está inativo.', {
      clientId: ['Cliente inativo.'],
    });
  if (input.scheduledTime && !input.scheduledDate)
    throw new AppError('VALIDATION', 'Informe a data para usar horário.', {
      scheduledDate: ['Informe a data.'],
    });
  const refs = await resolveRefs(db, ctx, input.clientId, input);
  assertCanAssign(ctx, input.clientId, null, input.assigneeUserId);
  if (input.requestId) {
    const [r] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(
        and(
          eq(requests.id, input.requestId),
          eq(requests.organizationId, ctx.organizationId),
          eq(requests.clientId, input.clientId),
        ),
      );
    if (!r)
      throw new AppError('VALIDATION', 'Solicitação inválida.', {
        requestId: ['Solicitação não encontrada neste cliente.'],
      });
  }
  const id = newId();
  const number = await db.transaction(async (tx) => {
    const n = await nextNumber(tx as unknown as Db, ctx.organizationId);
    await tx.insert(contents).values({
      id,
      organizationId: ctx.organizationId,
      number: n,
      clientId: input.clientId,
      brandId: refs.brandId,
      socialProfileId: input.socialProfileId ?? null,
      pillarId: input.pillarId ?? null,
      campaignId: input.campaignId ?? null,
      requestId: input.requestId ?? null,
      title: input.title,
      theme: input.theme ?? null,
      objective: input.objective ?? null,
      audience: input.audience ?? null,
      format: input.format,
      brief: input.brief ?? null,
      scheduledDate: input.scheduledDate ?? null,
      scheduledTime: input.scheduledTime ?? null,
      assigneeUserId: input.assigneeUserId ?? null,
      priority: input.priority ?? 'normal',
      createdBy: ctx.userId,
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'content.created',
      entityType: 'content',
      entityId: id,
      metadata: { number: n, clientId: input.clientId, title: input.title },
      ip: ctx.ip,
    });
    return n;
  });
  if (input.assigneeUserId && input.assigneeUserId !== ctx.userId) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: input.assigneeUserId,
      type: 'content_assigned',
      title: `Conteúdo #${number} atribuído a você`,
      body: input.title,
      link: `/conteudos/${id}`,
    });
  }
  const conflicts = await findConflicts(
    db,
    ctx,
    input.socialProfileId ?? null,
    input.scheduledDate ?? null,
    input.scheduledTime ?? null,
    id,
  );
  return { id, number, conflicts };
}

// ------------------------------------------------------------------- editar
export async function loadForWrite(db: Db, ctx: Ctx, id: string, perm: string) {
  const [c] = await db
    .select()
    .from(contents)
    .where(and(visibleContents(ctx), eq(contents.id, id)))
    .limit(1);
  if (!c) throw nf();
  requireCan(ctx, perm, c.clientId);
  if (!isInternal(ctx)) throw forbidden();
  return c;
}

const EDITABLE = [
  'title',
  'format',
  'brandId',
  'socialProfileId',
  'pillarId',
  'campaignId',
  'theme',
  'objective',
  'audience',
  'brief',
  'scheduledDate',
  'scheduledTime',
  'assigneeUserId',
  'priority',
] as const;

export async function updateContent(db: Db, ctx: Ctx, id: string, patch: UpdateContentInput) {
  const c = await loadForWrite(db, ctx, id, 'contents:edit');
  if (['published', 'archived'].includes(c.status))
    throw new AppError('CONFLICT', 'Este conteúdo não pode mais ser editado nesta situação.');
  const merged = {
    ...c,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  } as typeof c;
  if (patch.scheduledTime && !merged.scheduledDate)
    throw new AppError('VALIDATION', 'Informe a data para usar horário.', {
      scheduledDate: ['Informe a data.'],
    });
  const refs = await resolveRefs(db, ctx, c.clientId, {
    brandId: 'brandId' in patch ? patch.brandId : c.brandId,
    socialProfileId: 'socialProfileId' in patch ? patch.socialProfileId : c.socialProfileId,
    pillarId: 'pillarId' in patch ? patch.pillarId : c.pillarId,
    campaignId: 'campaignId' in patch ? patch.campaignId : c.campaignId,
    assigneeUserId: 'assigneeUserId' in patch ? patch.assigneeUserId : null,
  });
  assertCanAssign(ctx, c.clientId, c.assigneeUserId, patch.assigneeUserId);
  const set: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of EDITABLE) {
    if (!(f in patch)) continue;
    let next: unknown = (patch as Record<string, unknown>)[f] ?? null;
    if (f === 'brandId') next = refs.brandId;
    const prev = (c as Record<string, unknown>)[f] ?? null;
    const norm = (v: unknown) =>
      f === 'scheduledTime' && typeof v === 'string' ? v.slice(0, 5) : v;
    if (norm(next) !== norm(prev)) {
      set[f] = next;
      changes[f] = {
        from: typeof prev === 'string' ? prev.slice(0, 120) : prev,
        to: typeof next === 'string' ? next.slice(0, 120) : next,
      };
    }
  }
  if (!('brandId' in set) && refs.brandId !== c.brandId && 'socialProfileId' in patch)
    set.brandId = refs.brandId;
  if (merged.scheduledDate === null) set.scheduledTime = null;
  if (Object.keys(set).length === 0)
    return {
      conflicts: await findConflicts(
        db,
        ctx,
        c.socialProfileId,
        c.scheduledDate,
        c.scheduledTime,
        id,
      ),
    };
  await db.transaction(async (tx) => {
    await tx
      .update(contents)
      .set(set)
      .where(and(eq(contents.id, id), eq(contents.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'content.updated',
      entityType: 'content',
      entityId: id,
      metadata: { changes },
      ip: ctx.ip,
    });
  });
  if ('assigneeUserId' in set && set.assigneeUserId && set.assigneeUserId !== ctx.userId) {
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: set.assigneeUserId as string,
      type: 'content_assigned',
      title: `Conteúdo #${c.number} atribuído a você`,
      body: c.title,
      link: `/conteudos/${id}`,
    });
  }
  const profile = (set.socialProfileId ?? c.socialProfileId) as string | null;
  const date = (set.scheduledDate ?? c.scheduledDate) as string | null;
  const time = ('scheduledTime' in set ? set.scheduledTime : c.scheduledTime) as string | null;
  return { conflicts: await findConflicts(db, ctx, profile, date, time, id) };
}

// ------------------------------------------------------------------- status
export async function changeContentStatus(
  db: Db,
  ctx: Ctx,
  id: string,
  to: ContentStatus,
  message?: string,
) {
  const c = await loadForWrite(db, ctx, id, 'contents:edit');
  if (RESERVED_STATUSES.includes(to)) {
    throw new AppError(
      'CONFLICT',
      `“${CONTENT_STATUS_LABELS[to]}” é definido pelo fluxo de aprovação e publicação, não manualmente.`,
      { status: ['Estado controlado por outro módulo.'] },
    );
  }
  if (!canTransitionManually(c.status, to)) {
    throw new AppError(
      'CONFLICT',
      `Não é possível mudar de “${CONTENT_STATUS_LABELS[c.status]}” para “${CONTENT_STATUS_LABELS[to]}”.`,
      { status: ['Transição não permitida.'] },
    );
  }
  if (to === 'cancelled' && !message?.trim())
    throw new AppError('VALIDATION', 'Informe o motivo do cancelamento.', {
      message: ['O motivo é obrigatório.'],
    });
  await db.transaction(async (tx) => {
    await tx
      .update(contents)
      .set({ status: to })
      .where(and(eq(contents.id, id), eq(contents.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'content.status_changed',
      entityType: 'content',
      entityId: id,
      metadata: { from: c.status, to, message: message?.trim() || null },
      ip: ctx.ip,
    });
  });
}

// ---------------------------------------------------------------- duplicar
export async function duplicateContent(db: Db, ctx: Ctx, id: string) {
  const c = await loadForWrite(db, ctx, id, 'contents:create');
  const newIdValue = newId();
  const title = `${c.title} (cópia)`.slice(0, 190);
  const number = await db.transaction(async (tx) => {
    const n = await nextNumber(tx as unknown as Db, ctx.organizationId);
    await tx.insert(contents).values({
      id: newIdValue,
      organizationId: ctx.organizationId,
      number: n,
      clientId: c.clientId,
      brandId: c.brandId,
      socialProfileId: c.socialProfileId,
      pillarId: c.pillarId,
      campaignId: c.campaignId,
      requestId: null,
      title,
      theme: c.theme,
      objective: c.objective,
      audience: c.audience,
      format: c.format,
      brief: c.brief,
      scheduledDate: null,
      scheduledTime: null,
      assigneeUserId: null,
      priority: c.priority,
      status: 'draft',
      createdBy: ctx.userId,
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'content.duplicated',
      entityType: 'content',
      entityId: newIdValue,
      metadata: { from: id, fromNumber: c.number, number: n },
      ip: ctx.ip,
    });
    return n;
  });
  return { id: newIdValue, number };
}

// ------------------------------------------------------------------ excluir
export async function deleteContent(db: Db, ctx: Ctx, id: string) {
  const c = await loadForWrite(db, ctx, id, 'contents:delete');
  if (NON_DELETABLE_STATUSES.includes(c.status))
    throw new AppError(
      'CONFLICT',
      'Conteúdo no fluxo do cliente ou publicado não pode ser excluído. Cancele-o ou arquive-o.',
    );
  await db.transaction(async (tx) => {
    await tx
      .update(contents)
      .set({ deletedAt: new Date() })
      .where(and(eq(contents.id, id), eq(contents.organizationId, ctx.organizationId)));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'content.deleted',
      entityType: 'content',
      entityId: id,
      metadata: { number: c.number, title: c.title },
      ip: ctx.ip,
    });
  });
}

export async function listContentHistory(db: Db, ctx: Ctx, id: string) {
  await loadForWrite(db, ctx, id, 'contents:view'); // histórico é interno
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(
      and(
        eq(auditLogs.organizationId, ctx.organizationId),
        eq(auditLogs.entityType, 'content'),
        eq(auditLogs.entityId, id),
      ),
    )
    .orderBy(desc(auditLogs.id))
    .limit(100);
}

// ------------------------------------------------- converter solicitação
export async function convertRequestToContent(db: Db, ctx: Ctx, requestId: string) {
  const [r] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.organizationId, ctx.organizationId)))
    .limit(1);
  const scope = clientScope(ctx, 'requests:view');
  if (!r || !(scope.all || scope.clientIds.includes(r.clientId)))
    throw new AppError('NOT_FOUND', 'Solicitação não encontrada.');
  requireCan(ctx, 'requests:edit', r.clientId);
  requireCan(ctx, 'contents:create', r.clientId);
  if (!isInternal(ctx)) throw forbidden();
  if (r.status !== 'accepted')
    throw new AppError('CONFLICT', 'Só é possível converter solicitações aceitas.');
  if (r.convertedToId) throw new AppError('CONFLICT', 'Esta solicitação já foi convertida.');
  let profileId: string | null = null;
  if (r.brandId && r.network) {
    const ps = await db
      .select({ id: socialProfiles.id })
      .from(socialProfiles)
      .where(
        and(
          eq(socialProfiles.brandId, r.brandId),
          eq(socialProfiles.network, r.network),
          eq(socialProfiles.status, 'active'),
          isNull(socialProfiles.deletedAt),
        ),
      );
    if (ps.length === 1) profileId = ps[0]!.id; // só liga automaticamente quando não há ambiguidade
  }
  const brief = [r.description, r.referenceNotes ? `Referências: ${r.referenceNotes}` : null]
    .filter(Boolean)
    .join('\n\n');
  const created = await createContent(db, ctx, {
    clientId: r.clientId,
    requestId: r.id,
    title: r.title,
    format: formatFromRequest(r.format),
    brandId: r.brandId,
    socialProfileId: profileId,
    objective: r.objective,
    audience: r.audience,
    brief,
    scheduledDate: r.desiredDate,
    assigneeUserId: r.assigneeUserId,
    priority: r.priority,
  }).catch((e) => {
    // Responsável da solicitação sem permissão de atribuição para este usuário: converte sem responsável em vez de falhar.
    if (e instanceof AppError && e.code === 'FORBIDDEN') {
      return createContent(db, ctx, {
        clientId: r.clientId,
        requestId: r.id,
        title: r.title,
        format: formatFromRequest(r.format),
        brandId: r.brandId,
        socialProfileId: profileId,
        objective: r.objective,
        audience: r.audience,
        brief,
        scheduledDate: r.desiredDate,
        priority: r.priority,
      });
    }
    throw e;
  });
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set({ convertedToType: 'content', convertedToId: created.id })
      .where(eq(requests.id, r.id));
    await tx.insert(requestEvents).values({
      id: newId(),
      organizationId: ctx.organizationId,
      requestId: r.id,
      actorUserId: ctx.userId,
      kind: 'updated',
      body: `Convertida no conteúdo #${created.number}.`,
      metadata: { convertedTo: 'content', contentId: created.id },
      internalOnly: 0,
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'request.converted',
      entityType: 'request',
      entityId: r.id,
      metadata: { contentId: created.id, number: created.number },
      ip: ctx.ip,
    });
  });
  return created;
}

/** Pessoas internas ativas que podem receber conteúdos (usado por quem tem `contents:assign`). */
export async function listContentAssignees(db: Db, ctx: Ctx) {
  requireAnyScope(ctx, 'contents:assign');
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
