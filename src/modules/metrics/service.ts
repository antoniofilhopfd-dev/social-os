import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  approvals,
  brands,
  clients,
  contents,
  metricEntries,
  profileSnapshots,
  publications,
  socialProfiles,
  tasks,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { can, clientScope, requireAnyScope, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { startOfLocalDay, startOfNextLocalDay, todayLocal } from '@/core/time';
import {
  METRIC_FIELDS,
  engagementRate,
  interactions,
  sumKnown,
  toCsv,
  type MetricField,
} from './rules';

const nf = (what = 'Registro') => new AppError('NOT_FOUND', `${what} não encontrado.`);
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const MAX_RANGE_DAYS = 366;
const ROW_LIMIT = 5000;

type EntryRow = typeof metricEntries.$inferSelect;

function scopeCondition(
  ctx: Ctx,
  perm: string,
  col: Parameters<typeof inArray>[0],
): SQL | undefined {
  const scope = clientScope(ctx, perm);
  if (scope.all) return undefined;
  if (scope.clientIds.length === 0) return sql`1 = 0`;
  return inArray(col, scope.clientIds);
}

const pick = (e: EntryRow) =>
  Object.fromEntries(METRIC_FIELDS.map((f) => [f, e[f]])) as Record<MetricField, number | null>;

// ----------------------------------------------------------- registro manual
async function loadPublishedForMetrics(db: Db, ctx: Ctx, publicationId: string, perm: string) {
  requireAnyScope(ctx, perm);
  if (ctx.userKind !== 'internal') throw forbidden();
  const [p] = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.id, publicationId),
        eq(publications.organizationId, ctx.organizationId),
        scopeCondition(ctx, 'metrics:view', publications.clientId),
      ),
    );
  if (!p) throw nf('Publicação');
  if (!can(ctx, perm, p.clientId)) throw forbidden();
  return p;
}

function validateEntry(
  input: Partial<Record<MetricField, number | null>> & { capturedOn?: string },
  publishedAt: Date | null,
  now: Date,
) {
  const reach = input.reach;
  const imp = input.impressions;
  if (reach != null && imp != null && imp < reach)
    throw new AppError('VALIDATION', 'As impressões não podem ser menores que o alcance.', {
      impressions: ['As impressões não podem ser menores que o alcance.'],
    });
  if (input.capturedOn) {
    if (input.capturedOn > todayLocal(now))
      throw new AppError('VALIDATION', 'A data da coleta não pode estar no futuro.', {
        capturedOn: ['A data da coleta não pode estar no futuro.'],
      });
    if (publishedAt && input.capturedOn < todayLocal(publishedAt))
      throw new AppError('VALIDATION', 'A coleta não pode ser anterior à publicação.', {
        capturedOn: ['A coleta não pode ser anterior à publicação.'],
      });
  }
}

export async function recordMetrics(
  db: Db,
  ctx: Ctx,
  publicationId: string,
  input: { capturedOn: string; notes?: string | null } & Partial<
    Record<MetricField, number | null>
  >,
  now = new Date(),
) {
  const p = await loadPublishedForMetrics(db, ctx, publicationId, 'metrics:create');
  if (p.status !== 'published')
    throw new AppError(
      'CONFLICT',
      'Só é possível registrar resultados de publicações já publicadas.',
    );
  if (METRIC_FIELDS.every((f) => input[f] == null))
    throw new AppError('VALIDATION', 'Informe ao menos uma métrica.', {
      reach: ['Informe ao menos uma métrica.'],
    });
  validateEntry(input, p.publishedAt, now);
  const id = newId();
  await db.insert(metricEntries).values({
    id,
    organizationId: ctx.organizationId,
    clientId: p.clientId,
    publicationId,
    capturedOn: input.capturedOn,
    ...Object.fromEntries(METRIC_FIELDS.map((f) => [f, input[f] ?? null])),
    notes: input.notes?.trim() || null,
    createdBy: ctx.userId,
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'metrics.recorded',
    entityType: 'publication',
    entityId: publicationId,
    metadata: { entryId: id, capturedOn: input.capturedOn },
    ip: ctx.ip,
  });
  return { id };
}

async function loadEntry(db: Db, ctx: Ctx, id: string, perm: string) {
  requireAnyScope(ctx, perm);
  if (ctx.userKind !== 'internal') throw forbidden();
  const [e] = await db
    .select()
    .from(metricEntries)
    .where(
      and(
        eq(metricEntries.id, id),
        eq(metricEntries.organizationId, ctx.organizationId),
        isNull(metricEntries.deletedAt),
        scopeCondition(ctx, 'metrics:view', metricEntries.clientId),
      ),
    );
  if (!e) throw nf();
  if (!can(ctx, perm, e.clientId)) throw forbidden();
  return e;
}

export async function updateMetricEntry(
  db: Db,
  ctx: Ctx,
  id: string,
  patch: { capturedOn?: string; notes?: string | null } & Partial<
    Record<MetricField, number | null>
  >,
  now = new Date(),
) {
  const e = await loadEntry(db, ctx, id, 'metrics:edit');
  const [p] = await db.select().from(publications).where(eq(publications.id, e.publicationId));
  const merged = { ...pick(e), ...patch };
  validateEntry({ ...merged, capturedOn: patch.capturedOn }, p?.publishedAt ?? null, now);
  if (METRIC_FIELDS.every((f) => merged[f] == null))
    throw new AppError('VALIDATION', 'Informe ao menos uma métrica.', {
      reach: ['Informe ao menos uma métrica.'],
    });
  const set: Record<string, unknown> = {};
  for (const f of [...METRIC_FIELDS, 'capturedOn', 'notes'] as const)
    if (f in patch) set[f] = (patch as Record<string, unknown>)[f] ?? null;
  if (Object.keys(set).length === 0) return { id };
  await db.update(metricEntries).set(set).where(eq(metricEntries.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'metrics.updated',
    entityType: 'metric_entry',
    entityId: id,
    metadata: { fields: Object.keys(set) },
    ip: ctx.ip,
  });
  return { id };
}

export async function deleteMetricEntry(db: Db, ctx: Ctx, id: string) {
  await loadEntry(db, ctx, id, 'metrics:edit');
  await db.update(metricEntries).set({ deletedAt: new Date() }).where(eq(metricEntries.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'metrics.deleted',
    entityType: 'metric_entry',
    entityId: id,
    ip: ctx.ip,
  });
}

export async function listPublicationMetrics(db: Db, ctx: Ctx, publicationId: string) {
  requireAnyScope(ctx, 'metrics:view');
  const [p] = await db
    .select({ id: publications.id, clientId: publications.clientId })
    .from(publications)
    .where(
      and(
        eq(publications.id, publicationId),
        eq(publications.organizationId, ctx.organizationId),
        scopeCondition(ctx, 'metrics:view', publications.clientId),
      ),
    );
  if (!p) throw nf('Publicação');
  const rows = await db
    .select({ e: metricEntries, name: users.name })
    .from(metricEntries)
    .leftJoin(users, eq(users.id, metricEntries.createdBy))
    .where(and(eq(metricEntries.publicationId, publicationId), isNull(metricEntries.deletedAt)))
    .orderBy(desc(metricEntries.capturedOn), desc(metricEntries.createdAt));
  return rows.map(({ e, name }) => ({
    id: e.id,
    capturedOn: e.capturedOn,
    ...pick(e),
    interactions: interactions(pick(e)),
    engagementRate: engagementRate(pick(e)),
    notes: e.notes,
    source: e.source,
    createdByName: name,
    canEdit: can(ctx, 'metrics:edit', e.clientId),
  }));
}

// ------------------------------------------------------- seguidores do perfil
export async function recordFollowers(
  db: Db,
  ctx: Ctx,
  input: { socialProfileId: string; capturedOn: string; followers: number },
  now = new Date(),
) {
  requireAnyScope(ctx, 'metrics:create');
  if (ctx.userKind !== 'internal') throw forbidden();
  const [row] = await db
    .select({ id: socialProfiles.id, clientId: brands.clientId })
    .from(socialProfiles)
    .innerJoin(brands, eq(brands.id, socialProfiles.brandId))
    .where(
      and(
        eq(socialProfiles.id, input.socialProfileId),
        eq(socialProfiles.organizationId, ctx.organizationId),
        isNull(socialProfiles.deletedAt),
      ),
    );
  const sp = row;
  if (!sp || !can(ctx, 'metrics:view', sp.clientId)) throw nf('Perfil');
  if (!can(ctx, 'metrics:create', sp.clientId)) throw forbidden();
  if (input.capturedOn > todayLocal(now))
    throw new AppError('VALIDATION', 'A data não pode estar no futuro.', {
      capturedOn: ['A data não pode estar no futuro.'],
    });
  const id = newId();
  try {
    await db.insert(profileSnapshots).values({
      id,
      organizationId: ctx.organizationId,
      clientId: sp.clientId,
      socialProfileId: sp.id,
      capturedOn: input.capturedOn,
      followers: input.followers,
      createdBy: ctx.userId,
      activeKey: `${sp.id}:${input.capturedOn}`,
    });
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === 'ER_DUP_ENTRY')
      throw new AppError(
        'CONFLICT',
        'Já existe um registro de seguidores para este perfil neste dia.',
      );
    throw e;
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'metrics.followers_recorded',
    entityType: 'social_profile',
    entityId: sp.id,
    metadata: { capturedOn: input.capturedOn, followers: input.followers },
    ip: ctx.ip,
  });
  return { id };
}

export async function deleteSnapshot(db: Db, ctx: Ctx, id: string) {
  requireAnyScope(ctx, 'metrics:edit');
  if (ctx.userKind !== 'internal') throw forbidden();
  const [s] = await db
    .select()
    .from(profileSnapshots)
    .where(
      and(
        eq(profileSnapshots.id, id),
        eq(profileSnapshots.organizationId, ctx.organizationId),
        isNull(profileSnapshots.deletedAt),
      ),
    );
  if (!s || !can(ctx, 'metrics:view', s.clientId)) throw nf();
  if (!can(ctx, 'metrics:edit', s.clientId)) throw forbidden();
  await db
    .update(profileSnapshots)
    .set({ deletedAt: new Date(), activeKey: null })
    .where(eq(profileSnapshots.id, id));
}

export async function listSnapshots(db: Db, ctx: Ctx, socialProfileId: string) {
  requireAnyScope(ctx, 'metrics:view');
  const rows = await db
    .select()
    .from(profileSnapshots)
    .where(
      and(
        eq(profileSnapshots.socialProfileId, socialProfileId),
        eq(profileSnapshots.organizationId, ctx.organizationId),
        isNull(profileSnapshots.deletedAt),
        scopeCondition(ctx, 'metrics:view', profileSnapshots.clientId),
      ),
    )
    .orderBy(desc(profileSnapshots.capturedOn));
  return rows.map((s) => ({
    id: s.id,
    capturedOn: s.capturedOn,
    followers: s.followers,
    canEdit: can(ctx, 'metrics:edit', s.clientId),
  }));
}

// ---------------------------------------------------------------- relatórios
export interface ReportFilters {
  from: string;
  to: string;
  clientId?: string;
  profileId?: string;
}

function checkRange(f: ReportFilters) {
  if (f.from > f.to)
    throw new AppError('VALIDATION', 'A data inicial deve ser anterior à final.', {
      from: ['A data inicial deve ser anterior à final.'],
    });
  const days = (Date.parse(`${f.to}T00:00:00Z`) - Date.parse(`${f.from}T00:00:00Z`)) / 86_400_000;
  if (days > MAX_RANGE_DAYS)
    throw new AppError('VALIDATION', `O período máximo é de ${MAX_RANGE_DAYS} dias.`, {
      to: [`O período máximo é de ${MAX_RANGE_DAYS} dias.`],
    });
}

export async function performanceReport(db: Db, ctx: Ctx, f: ReportFilters) {
  requireAnyScope(ctx, 'metrics:view');
  checkRange(f);
  const start = startOfLocalDay(f.from);
  const end = startOfNextLocalDay(f.to);
  const where: (SQL | undefined)[] = [
    eq(publications.organizationId, ctx.organizationId),
    eq(publications.status, 'published'),
    gte(publications.publishedAt, start),
    lt(publications.publishedAt, end),
    scopeCondition(ctx, 'metrics:view', publications.clientId),
  ];
  if (f.clientId) where.push(eq(publications.clientId, f.clientId));
  if (f.profileId) where.push(eq(publications.socialProfileId, f.profileId));
  const rows = await db
    .select({
      p: publications,
      title: contents.title,
      number: contents.number,
      format: contents.format,
      clientName: clients.name,
      network: socialProfiles.network,
      handle: socialProfiles.handle,
    })
    .from(publications)
    .innerJoin(contents, eq(contents.id, publications.contentId))
    .innerJoin(clients, eq(clients.id, publications.clientId))
    .innerJoin(socialProfiles, eq(socialProfiles.id, publications.socialProfileId))
    .where(and(...where))
    .orderBy(desc(publications.publishedAt))
    .limit(ROW_LIMIT);

  const ids = rows.map((r) => r.p.id);
  const entries = ids.length
    ? await db
        .select()
        .from(metricEntries)
        .where(and(inArray(metricEntries.publicationId, ids), isNull(metricEntries.deletedAt)))
        .orderBy(desc(metricEntries.capturedOn), desc(metricEntries.createdAt))
    : [];
  const latest = new Map<string, EntryRow>();
  for (const e of entries) if (!latest.has(e.publicationId)) latest.set(e.publicationId, e);

  const posts = rows.map((r) => {
    const e = latest.get(r.p.id);
    const m = e ? pick(e) : null;
    return {
      publicationId: r.p.id,
      contentId: r.p.contentId,
      number: r.number,
      title: r.title,
      format: r.format,
      clientId: r.p.clientId,
      clientName: r.clientName,
      network: r.network,
      handle: r.handle,
      publishedAt: r.p.publishedAt,
      postUrl: r.p.postUrl,
      capturedOn: e?.capturedOn ?? null,
      metrics: m,
      interactions: m ? interactions(m) : null,
      engagementRate: m ? engagementRate(m) : null,
    };
  });
  const withMetrics = posts.filter((p) => p.metrics);
  const total = (field: MetricField) => sumKnown(withMetrics.map((p) => p.metrics![field]));
  const totals = {
    posts: posts.length,
    postsWithMetrics: withMetrics.length,
    reach: total('reach'),
    impressions: total('impressions'),
    interactions: sumKnown(withMetrics.map((p) => p.interactions)),
    clicks: total('clicks'),
    videoViews: total('videoViews'),
    followersGained: total('followersGained'),
  };
  const overallRate = (() => {
    const r = sumKnown(
      withMetrics
        .filter((p) => p.interactions != null && p.metrics!.reach)
        .map((p) => p.metrics!.reach),
    );
    const i = sumKnown(
      withMetrics
        .filter((p) => p.interactions != null && p.metrics!.reach)
        .map((p) => p.interactions),
    );
    return r && i != null ? Math.round((i / r) * 1000) / 10 : null;
  })();

  const group = (key: (p: (typeof posts)[number]) => string) => {
    const map = new Map<string, typeof posts>();
    for (const p of posts) map.set(key(p), [...(map.get(key(p)) ?? []), p]);
    return [...map.entries()]
      .map(([k, list]) => {
        const wm = list.filter((p) => p.metrics);
        return {
          key: k,
          posts: list.length,
          postsWithMetrics: wm.length,
          reach: sumKnown(wm.map((p) => p.metrics!.reach)),
          interactions: sumKnown(wm.map((p) => p.interactions)),
        };
      })
      .sort((a, b) => b.posts - a.posts);
  };
  const top = withMetrics
    .filter((p) => p.interactions != null)
    .sort((a, b) => (b.interactions ?? 0) - (a.interactions ?? 0))
    .slice(0, 5);

  // crescimento de seguidores por perfil (primeiro × último registro dentro do período)
  const snapWhere: (SQL | undefined)[] = [
    eq(profileSnapshots.organizationId, ctx.organizationId),
    isNull(profileSnapshots.deletedAt),
    sql`${profileSnapshots.capturedOn} >= ${f.from}`,
    sql`${profileSnapshots.capturedOn} <= ${f.to}`,
    scopeCondition(ctx, 'metrics:view', profileSnapshots.clientId),
  ];
  if (f.clientId) snapWhere.push(eq(profileSnapshots.clientId, f.clientId));
  if (f.profileId) snapWhere.push(eq(profileSnapshots.socialProfileId, f.profileId));
  const snaps = await db
    .select({
      s: profileSnapshots,
      network: socialProfiles.network,
      handle: socialProfiles.handle,
      clientName: clients.name,
    })
    .from(profileSnapshots)
    .innerJoin(socialProfiles, eq(socialProfiles.id, profileSnapshots.socialProfileId))
    .innerJoin(clients, eq(clients.id, profileSnapshots.clientId))
    .where(and(...snapWhere))
    .orderBy(profileSnapshots.capturedOn);
  const byProfile = new Map<string, typeof snaps>();
  for (const s of snaps)
    byProfile.set(s.s.socialProfileId, [...(byProfile.get(s.s.socialProfileId) ?? []), s]);
  const followers = [...byProfile.values()].map((list) => {
    const first = list[0]!;
    const last = list[list.length - 1]!;
    return {
      profileId: first.s.socialProfileId,
      clientName: first.clientName,
      network: first.network,
      handle: first.handle,
      from: first.s.capturedOn,
      to: last.s.capturedOn,
      start: first.s.followers,
      end: last.s.followers,
      growth: list.length >= 2 ? last.s.followers - first.s.followers : null,
    };
  });

  return {
    filters: f,
    totals: { ...totals, engagementRate: overallRate },
    byNetwork: group((p) => p.network),
    byFormat: group((p) => p.format),
    top,
    posts,
    followers,
    truncated: rows.length >= ROW_LIMIT,
  };
}

export async function exportPerformanceCsv(db: Db, ctx: Ctx, f: ReportFilters) {
  requireAnyScope(ctx, 'metrics:export');
  if (ctx.userKind !== 'internal') throw forbidden();
  const report = await performanceReport(db, ctx, f);
  // exportar exige a permissão em TODOS os clientes presentes no relatório
  for (const p of report.posts) if (!can(ctx, 'metrics:export', p.clientId)) throw forbidden();
  const headers = [
    'Cliente',
    'Rede',
    'Perfil',
    'Conteúdo',
    'Formato',
    'Publicado em',
    'Link',
    'Coleta em',
    ...METRIC_FIELDS.map((k) => k),
    'interactions',
    'engagementRate',
  ];
  const labels = {
    reach: 'Alcance',
    impressions: 'Impressões',
    likes: 'Curtidas',
    comments: 'Comentários',
    shares: 'Compartilhamentos',
    saves: 'Salvamentos',
    clicks: 'Cliques',
    videoViews: 'Visualizações de vídeo',
    followersGained: 'Novos seguidores',
    interactions: 'Interações',
    engagementRate: 'Taxa de engajamento (%)',
  } as const;
  const csvHeaders = headers.map((h) => (h in labels ? labels[h as keyof typeof labels] : h));
  const rows = report.posts.map((p) => [
    p.clientName,
    p.network,
    `@${p.handle}`,
    `#${p.number} ${p.title}`,
    p.format,
    p.publishedAt,
    p.postUrl,
    p.capturedOn,
    ...METRIC_FIELDS.map((k) => p.metrics?.[k] ?? null),
    p.interactions,
    p.engagementRate,
  ]);
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'metrics.exported',
    entityType: 'report',
    metadata: { from: f.from, to: f.to, rows: rows.length, clientId: f.clientId ?? null },
    ip: ctx.ip,
  });
  return toCsv(csvHeaders, rows);
}

/** Relatório operacional (só equipe): produção, aprovações, publicações e tarefas do período. */
export async function operationsReport(db: Db, ctx: Ctx, f: ReportFilters, now = new Date()) {
  requireAnyScope(ctx, 'metrics:view');
  if (ctx.userKind !== 'internal') throw forbidden();
  checkRange(f);
  const start = startOfLocalDay(f.from);
  const end = startOfNextLocalDay(f.to);
  const org = ctx.organizationId;
  const clientEq = (col: Parameters<typeof eq>[0]) =>
    f.clientId ? eq(col, f.clientId) : undefined;

  const contentRows = await db
    .select({ status: contents.status, n: sql<number>`count(*)` })
    .from(contents)
    .where(
      and(
        eq(contents.organizationId, org),
        isNull(contents.deletedAt),
        gte(contents.createdAt, start),
        lt(contents.createdAt, end),
        scopeCondition(ctx, 'metrics:view', contents.clientId),
        clientEq(contents.clientId),
      ),
    )
    .groupBy(contents.status);

  const apprRows = await db
    .select()
    .from(approvals)
    .where(
      and(
        eq(approvals.organizationId, org),
        gte(approvals.requestedAt, start),
        lt(approvals.requestedAt, end),
        scopeCondition(ctx, 'metrics:view', approvals.clientId),
        clientEq(approvals.clientId),
      ),
    )
    .limit(ROW_LIMIT);
  const decided = apprRows.filter((a) => a.decidedAt);
  const avgHours = decided.length
    ? Math.round(
        (decided.reduce((s, a) => s + (a.decidedAt!.getTime() - a.requestedAt.getTime()), 0) /
          decided.length /
          3_600_000) *
          10,
      ) / 10
    : null;

  const pubRows = await db
    .select()
    .from(publications)
    .where(
      and(
        eq(publications.organizationId, org),
        sql`${publications.scheduledDate} >= ${f.from}`,
        sql`${publications.scheduledDate} <= ${f.to}`,
        scopeCondition(ctx, 'metrics:view', publications.clientId),
        clientEq(publications.clientId),
      ),
    )
    .limit(ROW_LIMIT);
  const today = todayLocal(now);
  const published = pubRows.filter((p) => p.status === 'published');
  const onTime = published.filter(
    (p) => p.publishedAt && todayLocal(p.publishedAt) <= p.scheduledDate,
  );

  const taskBase = [
    eq(tasks.organizationId, org),
    isNull(tasks.deletedAt),
    scopeCondition(ctx, 'metrics:view', tasks.clientId),
    clientEq(tasks.clientId),
  ];
  const [[created], [done], [overdue]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...taskBase, gte(tasks.createdAt, start), lt(tasks.createdAt, end))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(and(...taskBase, gte(tasks.completedAt, start), lt(tasks.completedAt, end))),
    db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(
        and(
          ...taskBase,
          inArray(tasks.status, ['todo', 'in_progress', 'blocked', 'in_review']),
          lt(tasks.dueDate, today),
        ),
      ),
  ]);

  return {
    filters: f,
    contents: {
      created: contentRows.reduce((s, r) => s + Number(r.n), 0),
      byStatus: Object.fromEntries(contentRows.map((r) => [r.status, Number(r.n)])),
    },
    approvals: {
      sent: apprRows.length,
      approved: apprRows.filter((a) => a.status === 'approved').length,
      changesRequested: apprRows.filter((a) => a.status === 'changes_requested').length,
      pending: apprRows.filter((a) => a.status === 'pending').length,
      avgResponseHours: avgHours,
    },
    publications: {
      total: pubRows.length,
      published: published.length,
      scheduled: pubRows.filter((p) => p.status === 'scheduled').length,
      failed: pubRows.filter((p) => p.status === 'failed').length,
      overdue: pubRows.filter((p) => p.status === 'scheduled' && p.scheduledDate < today).length,
      onTimeRate: published.length ? Math.round((onTime.length / published.length) * 100) : null,
    },
    tasks: {
      created: Number(created?.n ?? 0),
      completed: Number(done?.n ?? 0),
      overdueOpen: Number(overdue?.n ?? 0),
    },
  };
}
