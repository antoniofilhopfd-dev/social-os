import { and, asc, desc, eq, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  approvalAssets,
  approvals,
  assets,
  clients,
  contentAssets,
  contentDrafts,
  contentVersions,
  contents,
  publicationEvents,
  publications,
  socialProfiles,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { can, clientScope, requireAnyScope, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { nowTimeLocal, todayLocal } from '@/core/time';
import { findConflicts, loadForWrite } from '@/modules/contents/service';
import { normalizeBody } from '@/modules/editor/rules';
import { notify } from '@/modules/notifications/service';
import { buildPostText, parsePostUrl, queueState, type PublicationStatus } from './rules';

export const PUBLICATIONS_PAGE_SIZE = 50;
const nf = () => new AppError('NOT_FOUND', 'Publicação não encontrada.');
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const dupCode = (e: unknown) =>
  (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;

/** Condição base de toda consulta: organização + escopo de `publications:view`; só equipe interna. */
export function visiblePublications(ctx: Ctx) {
  const base: (SQL | undefined)[] = [eq(publications.organizationId, ctx.organizationId)];
  if (ctx.userKind !== 'internal') return and(...base, eq(publications.id, '__none__'));
  const scope = clientScope(ctx, 'publications:view');
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(publications.id, '__none__'));
  return and(...base, inArray(publications.clientId, scope.clientIds));
}

async function loadPublication(db: Db, ctx: Ctx, id: string, perm = 'publications:view') {
  requireAnyScope(ctx, perm);
  const [p] = await db
    .select()
    .from(publications)
    .where(and(visiblePublications(ctx), eq(publications.id, id)));
  if (!p) throw nf();
  if (!can(ctx, perm, p.clientId)) throw forbidden();
  return p;
}

async function event(
  db: Pick<Db, 'insert'>,
  ctx: Ctx,
  publicationId: string,
  kind: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(publicationEvents).values({
    id: newId(),
    organizationId: ctx.organizationId,
    publicationId,
    actorUserId: ctx.userId,
    kind,
    metadata: metadata ?? null,
  });
}

function checkSchedule(date: string, time: string | null | undefined, now: Date) {
  const today = todayLocal(now);
  if (date < today)
    throw new AppError('VALIDATION', 'A data de publicação não pode estar no passado.', {
      date: ['A data de publicação não pode estar no passado.'],
    });
  if (date === today && time && time < nowTimeLocal(now))
    throw new AppError('VALIDATION', 'O horário já passou.', { time: ['O horário já passou.'] });
}

// ------------------------------------------------------------------ programar
export async function schedulePublication(
  db: Db,
  ctx: Ctx,
  contentId: string,
  input: { date: string; time?: string | null; waiveApproval?: boolean; notes?: string | null },
  now = new Date(),
) {
  const c = await loadForWrite(db, ctx, contentId, 'publications:create');
  const waived = c.status !== 'approved';
  if (waived) {
    if (!input.waiveApproval || !['in_production', 'internal_review'].includes(c.status))
      throw new AppError(
        'CONFLICT',
        'Só conteúdos aprovados pelo cliente podem ser programados. Aprove o conteúdo ou dispense a aprovação.',
      );
    if (!can(ctx, 'contents:approve', c.clientId)) throw forbidden();
  }
  if (!c.socialProfileId)
    throw new AppError('VALIDATION', 'Defina o perfil social do conteúdo antes de programar.', {
      socialProfileId: ['Escolha o perfil em que o conteúdo será publicado.'],
    });
  checkSchedule(input.date, input.time, now);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(publications).values({
        id,
        organizationId: ctx.organizationId,
        clientId: c.clientId,
        contentId,
        socialProfileId: c.socialProfileId!,
        status: 'scheduled',
        activeKey: contentId,
        scheduledDate: input.date,
        scheduledTime: input.time ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      await tx
        .update(contents)
        .set({ status: 'scheduled', scheduledDate: input.date, scheduledTime: input.time ?? null })
        .where(and(eq(contents.id, contentId), eq(contents.organizationId, ctx.organizationId)));
      await event(tx, ctx, id, 'scheduled', {
        date: input.date,
        time: input.time ?? null,
        waivedApproval: waived,
      });
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'publication.scheduled',
        entityType: 'publication',
        entityId: id,
        metadata: { contentId, date: input.date, waivedApproval: waived },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    if (dupCode(e) === 'ER_DUP_ENTRY')
      throw new AppError('CONFLICT', 'Este conteúdo já está programado.');
    throw e;
  }
  const conflicts = await findConflicts(
    db,
    ctx,
    c.socialProfileId,
    input.date,
    input.time ?? null,
    contentId,
  );
  if (c.assigneeUserId && c.assigneeUserId !== ctx.userId)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: c.assigneeUserId,
      type: 'publication_scheduled',
      title: `Publicação programada: ${c.title}`,
      link: `/publicacoes/${id}`,
    });
  return { id, conflicts };
}

export async function reschedulePublication(
  db: Db,
  ctx: Ctx,
  id: string,
  input: { date: string; time?: string | null },
  now = new Date(),
) {
  const p = await loadPublication(db, ctx, id, 'publications:edit');
  if (p.status !== 'scheduled')
    throw new AppError('CONFLICT', 'Só publicações programadas podem ser reagendadas.');
  checkSchedule(input.date, input.time, now);
  await db.transaction(async (tx) => {
    await tx
      .update(publications)
      .set({ scheduledDate: input.date, scheduledTime: input.time ?? null, updatedBy: ctx.userId })
      .where(eq(publications.id, id));
    await tx
      .update(contents)
      .set({ scheduledDate: input.date, scheduledTime: input.time ?? null })
      .where(eq(contents.id, p.contentId));
    await event(tx, ctx, id, 'rescheduled', {
      from: { date: p.scheduledDate, time: p.scheduledTime },
      to: { date: input.date, time: input.time ?? null },
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'publication.rescheduled',
      entityType: 'publication',
      entityId: id,
      metadata: { date: input.date },
      ip: ctx.ip,
    });
  });
  return {
    conflicts: await findConflicts(
      db,
      ctx,
      p.socialProfileId,
      input.date,
      input.time ?? null,
      p.contentId,
    ),
  };
}

async function closeProgrammed(
  db: Db,
  ctx: Ctx,
  p: typeof publications.$inferSelect,
  set: Partial<typeof publications.$inferInsert>,
  contentStatus: 'approved' | 'internal_review' | 'published',
  kind: string,
  metadata: Record<string, unknown>,
) {
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(publications)
      .where(eq(publications.id, p.id))
      .for('update');
    if (!cur || cur.status !== 'scheduled')
      throw new AppError('CONFLICT', 'Esta publicação já foi concluída ou cancelada.');
    await tx
      .update(publications)
      .set({ ...set, activeKey: null, updatedBy: ctx.userId })
      .where(eq(publications.id, p.id));
    await tx.update(contents).set({ status: contentStatus }).where(eq(contents.id, p.contentId));
    await event(tx, ctx, p.id, kind, metadata);
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: `publication.${kind}`,
      entityType: 'publication',
      entityId: p.id,
      metadata: { contentId: p.contentId, ...metadata },
      ip: ctx.ip,
    });
  });
}

/** Registra que a publicação foi feita manualmente na rede (nenhuma rede é acessada nesta etapa). */
export async function markPublished(
  db: Db,
  ctx: Ctx,
  id: string,
  input: { publishedAt?: string; postUrl?: string | null; notes?: string | null },
  now = new Date(),
) {
  const p = await loadPublication(db, ctx, id, 'publications:publish');
  let postUrl: string | null = null;
  if (input.postUrl) {
    postUrl = parsePostUrl(input.postUrl);
    if (!postUrl)
      throw new AppError('VALIDATION', 'Link inválido.', {
        postUrl: ['Informe um link http(s) válido, sem usuário e senha.'],
      });
  }
  const at = input.publishedAt ? new Date(input.publishedAt) : now;
  if (at.getTime() > now.getTime() + 5 * 60_000)
    throw new AppError('VALIDATION', 'A data de publicação não pode estar no futuro.', {
      publishedAt: ['A data de publicação não pode estar no futuro.'],
    });
  await closeProgrammed(
    db,
    ctx,
    p,
    {
      status: 'published',
      publishedAt: at,
      postUrl,
      notes: input.notes ?? p.notes,
      failureReason: null,
    },
    'published',
    'published',
    { postUrl, publishedAt: at.toISOString() },
  );
}

export async function markFailed(db: Db, ctx: Ctx, id: string, reason: string) {
  const p = await loadPublication(db, ctx, id, 'publications:publish');
  if (reason.trim().length < 3)
    throw new AppError('VALIDATION', 'Informe o motivo.', { reason: ['Informe o motivo.'] });
  if (p.status !== 'scheduled')
    throw new AppError('CONFLICT', 'Só publicações programadas podem falhar.');
  await closeProgrammed(
    db,
    ctx,
    p,
    { status: 'failed', failureReason: reason },
    'approved',
    'failed',
    { reason },
  );
  const [c] = await db
    .select({ title: contents.title, a: contents.assigneeUserId })
    .from(contents)
    .where(eq(contents.id, p.contentId));
  if (c?.a && c.a !== ctx.userId)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: c.a,
      type: 'publication_failed',
      title: `Falha ao publicar: ${c.title}`,
      link: `/publicacoes/${id}`,
    });
}

export async function cancelPublication(db: Db, ctx: Ctx, id: string) {
  const p = await loadPublication(db, ctx, id, 'publications:edit');
  const [ap] = await db
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.contentId, p.contentId), eq(approvals.status, 'approved')))
    .limit(1);
  await closeProgrammed(
    db,
    ctx,
    p,
    { status: 'cancelled' },
    ap ? 'approved' : 'internal_review',
    'cancelled',
    {},
  );
}

// ------------------------------------------------------------------- consulta
export async function listPublications(
  db: Db,
  ctx: Ctx,
  f: {
    clientId?: string;
    contentId?: string;
    status?: string;
    from?: string;
    to?: string;
    before?: string;
    limit?: number;
  } = {},
  now = new Date(),
) {
  requireAnyScope(ctx, 'publications:view');
  if (ctx.userKind !== 'internal') throw forbidden();
  const where: (SQL | undefined)[] = [visiblePublications(ctx)];
  if (f.clientId) where.push(eq(publications.clientId, f.clientId));
  if (f.contentId) where.push(eq(publications.contentId, f.contentId));
  if (f.status) where.push(eq(publications.status, f.status as PublicationStatus));
  if (f.from) where.push(sql`${publications.scheduledDate} >= ${f.from}`);
  if (f.to) where.push(sql`${publications.scheduledDate} <= ${f.to}`);
  if (f.before) where.push(lt(publications.id, f.before));
  const limit = Math.min(f.limit ?? PUBLICATIONS_PAGE_SIZE, 300);
  const rows = await db
    .select({
      p: publications,
      title: contents.title,
      number: contents.number,
      format: contents.format,
      clientName: clients.name,
      network: socialProfiles.network,
      handle: socialProfiles.handle,
      assignee: users.name,
    })
    .from(publications)
    .innerJoin(contents, eq(contents.id, publications.contentId))
    .innerJoin(clients, eq(clients.id, publications.clientId))
    .innerJoin(socialProfiles, eq(socialProfiles.id, publications.socialProfileId))
    .leftJoin(users, eq(users.id, contents.assigneeUserId))
    .where(and(...where))
    .orderBy(
      asc(publications.scheduledDate),
      asc(publications.scheduledTime),
      desc(publications.id),
    )
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const today = todayLocal(now);
  const t = nowTimeLocal(now);
  return {
    items: page.map(({ p, title, number, format, clientName, network, handle, assignee }) => ({
      id: p.id,
      contentId: p.contentId,
      contentNumber: number,
      title,
      format,
      clientId: p.clientId,
      clientName,
      network,
      handle,
      assigneeName: assignee,
      status: p.status,
      scheduledDate: p.scheduledDate,
      scheduledTime: p.scheduledTime?.slice(0, 5) ?? null,
      publishedAt: p.publishedAt,
      postUrl: p.postUrl,
      queue: queueState(
        { status: p.status, scheduledDate: p.scheduledDate, scheduledTime: p.scheduledTime },
        today,
        t,
      ),
    })),
    nextBefore: rows.length > limit ? page[page.length - 1]!.p.id : null,
  };
}

export async function getPublication(db: Db, ctx: Ctx, id: string, now = new Date()) {
  const p = await loadPublication(db, ctx, id);
  const [[c], [profile], events] = await Promise.all([
    db.select().from(contents).where(eq(contents.id, p.contentId)),
    db.select().from(socialProfiles).where(eq(socialProfiles.id, p.socialProfileId)),
    db
      .select({ e: publicationEvents, name: users.name })
      .from(publicationEvents)
      .leftJoin(users, eq(users.id, publicationEvents.actorUserId))
      .where(eq(publicationEvents.publicationId, id))
      .orderBy(desc(publicationEvents.createdAt)),
  ]);
  if (!c) throw nf();
  // texto: versão aprovada pelo cliente (se houver); senão a última versão salva; senão o rascunho
  const [ap] = await db
    .select({ versionId: approvals.versionId, id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.contentId, p.contentId), eq(approvals.status, 'approved')))
    .orderBy(desc(approvals.round))
    .limit(1);
  let source: 'approved' | 'version' | 'draft' = 'draft';
  let rawBody: Partial<import('@/db/schema').EditorBody> | null | undefined = null;
  if (ap) {
    const [v] = await db.select().from(contentVersions).where(eq(contentVersions.id, ap.versionId));
    rawBody = v?.body;
    source = 'approved';
  } else {
    const [v] = await db
      .select()
      .from(contentVersions)
      .where(eq(contentVersions.contentId, p.contentId))
      .orderBy(desc(contentVersions.versionNumber))
      .limit(1);
    if (v) {
      rawBody = v.body;
      source = 'version';
    } else {
      const [d] = await db
        .select()
        .from(contentDrafts)
        .where(eq(contentDrafts.contentId, p.contentId));
      rawBody = d?.body;
    }
  }
  const body = normalizeBody(rawBody);
  const files = ap
    ? await db
        .select({ a: assets, role: approvalAssets.role })
        .from(approvalAssets)
        .innerJoin(assets, eq(assets.id, approvalAssets.assetId))
        .where(eq(approvalAssets.approvalId, ap.id))
    : await db
        .select({ a: assets, role: contentAssets.role })
        .from(contentAssets)
        .innerJoin(assets, eq(assets.id, contentAssets.assetId))
        .where(and(eq(contentAssets.contentId, p.contentId), isNull(assets.deletedAt)));
  const today = todayLocal(now);
  return {
    id: p.id,
    status: p.status,
    scheduledDate: p.scheduledDate,
    scheduledTime: p.scheduledTime?.slice(0, 5) ?? null,
    queue: queueState(
      { status: p.status, scheduledDate: p.scheduledDate, scheduledTime: p.scheduledTime },
      today,
      nowTimeLocal(now),
    ),
    publishedAt: p.publishedAt,
    postUrl: p.postUrl,
    failureReason: p.failureReason,
    notes: p.notes,
    content: {
      id: c.id,
      number: c.number,
      title: c.title,
      format: c.format,
      status: c.status,
      clientId: c.clientId,
    },
    profile: profile
      ? { network: profile.network, handle: profile.handle, name: profile.profileName }
      : null,
    package: {
      source,
      text: buildPostText(body),
      caption: body.caption,
      hashtags: body.hashtags,
      altText: body.altText,
      coverText: body.coverText,
      slides: body.slides,
      publishNotes: body.publishNotes,
      assets: files.map(({ a, role }) => ({
        id: a.id,
        name: a.displayName,
        kind: a.kind,
        mime: a.mime,
        sizeBytes: a.sizeBytes,
        role,
        trashed: a.deletedAt !== null,
      })),
    },
    events: events.map(({ e, name }) => ({
      id: e.id,
      kind: e.kind,
      metadata: e.metadata,
      actorName: name,
      createdAt: e.createdAt,
    })),
    permissions: {
      edit: can(ctx, 'publications:edit', p.clientId),
      publish: can(ctx, 'publications:publish', p.clientId),
    },
  };
}
