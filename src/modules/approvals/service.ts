import { and, desc, eq, inArray, isNull, lt, max, ne, or, type SQL } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  approvalAssets,
  approvalComments,
  approvals,
  assets,
  clients,
  contentAssets,
  contentDrafts,
  contentVersions,
  contents,
  memberships,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { buildContext, can, clientScope, requireAnyScope, type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { loadForWrite } from '@/modules/contents/service';
import { saveVersion } from '@/modules/editor/service';
import { normalizeBody } from '@/modules/editor/rules';
import { notify } from '@/modules/notifications/service';
import { readAssetBytes } from '@/modules/library/service';
import type { StorageDriver } from '@/integrations/storage/types';
import { clientView, hasReviewableContent, SENDABLE_STATUSES, type ApprovalStatus } from './rules';

export const APPROVALS_PAGE_SIZE = 40;
const nf = () => new AppError('NOT_FOUND', 'Aprovação não encontrada.');
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const isInternal = (ctx: Ctx) => ctx.userKind === 'internal';

/** Condição base de TODA consulta: organização + escopo de `approvals:view`; externos não veem rodadas canceladas. */
export function visibleApprovals(ctx: Ctx) {
  const base: (SQL | undefined)[] = [eq(approvals.organizationId, ctx.organizationId)];
  if (!isInternal(ctx)) base.push(ne(approvals.status, 'cancelled'));
  const scope = clientScope(ctx, 'approvals:view');
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(approvals.id, '__none__'));
  return and(...base, inArray(approvals.clientId, scope.clientIds));
}

/** Pessoas externas ativas que podem aprovar conteúdos do cliente. */
export async function listApprovers(db: Db, organizationId: string, clientId: string) {
  const rows = await db
    .selectDistinct({ userId: users.id, name: users.name })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(users.kind, 'external'),
        eq(users.status, 'active'),
        or(isNull(memberships.clientId), eq(memberships.clientId, clientId)),
      ),
    );
  const out: { userId: string; name: string }[] = [];
  for (const r of rows) {
    const c = await buildContext(db, { userId: r.userId, organizationId });
    if (c && can(c, 'approvals:approve', clientId)) out.push(r);
  }
  return out;
}

async function loadApproval(db: Db, ctx: Ctx, id: string) {
  requireAnyScope(ctx, 'approvals:view');
  const [a] = await db
    .select()
    .from(approvals)
    .where(and(visibleApprovals(ctx), eq(approvals.id, id)));
  if (!a) throw nf();
  return a;
}

// --------------------------------------------------------------------- envio
/** Envia o conteúdo ao cliente: congela uma versão do texto e os arquivos vinculados e abre uma rodada. */
export async function submitForApproval(db: Db, ctx: Ctx, contentId: string, message?: string) {
  const c = await loadForWrite(db, ctx, contentId, 'contents:approve');
  if (!(SENDABLE_STATUSES as readonly string[]).includes(c.status))
    throw new AppError(
      'CONFLICT',
      'O conteúdo não está em uma situação que permita enviar ao cliente.',
    );
  const [draft] = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.contentId, contentId));
  if (!draft || !hasReviewableContent(normalizeBody(draft.body)))
    throw new AppError(
      'VALIDATION',
      'Preencha o texto do conteúdo no editor antes de enviar ao cliente.',
      {
        body: ['Não há texto, roteiro ou slides para o cliente avaliar.'],
      },
    );
  const approvers = await listApprovers(db, ctx.organizationId, c.clientId);
  if (approvers.length === 0)
    throw new AppError('VALIDATION', 'Este cliente não tem nenhum aprovador cadastrado.', {
      client: ['Convide um usuário externo com permissão de aprovar para este cliente.'],
    });

  // versão congelada: reaproveita a última se nada mudou desde então
  let versionId: string;
  try {
    versionId = (await saveVersion(db, ctx, contentId, 'Enviada para aprovação do cliente')).id;
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== 'CONFLICT') throw e;
    const [last] = await db
      .select({ id: contentVersions.id })
      .from(contentVersions)
      .where(eq(contentVersions.contentId, contentId))
      .orderBy(desc(contentVersions.versionNumber))
      .limit(1);
    if (!last) throw e;
    versionId = last.id;
  }

  const id = newId();
  try {
    await db.transaction(async (tx) => {
      const [r] = await tx
        .select({ n: max(approvals.round) })
        .from(approvals)
        .where(eq(approvals.contentId, contentId));
      await tx.insert(approvals).values({
        id,
        organizationId: ctx.organizationId,
        clientId: c.clientId,
        contentId,
        round: (r?.n ?? 0) + 1,
        versionId,
        status: 'pending',
        pendingKey: contentId,
        message: message?.trim() || null,
        requestedBy: ctx.userId,
      });
      const linked = await tx
        .select({ assetId: contentAssets.assetId, role: contentAssets.role })
        .from(contentAssets)
        .innerJoin(assets, eq(assets.id, contentAssets.assetId))
        .where(and(eq(contentAssets.contentId, contentId), isNull(assets.deletedAt)));
      if (linked.length)
        await tx
          .insert(approvalAssets)
          .values(linked.map((l) => ({ approvalId: id, assetId: l.assetId, role: l.role })));
      await tx
        .update(contents)
        .set({ status: 'awaiting_client' })
        .where(and(eq(contents.id, contentId), eq(contents.organizationId, ctx.organizationId)));
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'approval.requested',
        entityType: 'approval',
        entityId: id,
        metadata: { contentId, from: c.status },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
    if (code === 'ER_DUP_ENTRY')
      throw new AppError('CONFLICT', 'Já existe uma aprovação pendente para este conteúdo.');
    throw e;
  }
  for (const a of approvers)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId: a.userId,
      type: 'approval_requested',
      title: `Conteúdo para aprovar: ${c.title}`,
      link: `/aprovacoes/${id}`,
    });
  return { id };
}

/** Cancela a rodada pendente (antes da decisão do cliente) e devolve o conteúdo à revisão interna. */
export async function cancelApproval(db: Db, ctx: Ctx, approvalId: string) {
  const a = await loadApproval(db, ctx, approvalId);
  await loadForWrite(db, ctx, a.contentId, 'contents:approve');
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .for('update');
    if (!cur || cur.status !== 'pending')
      throw new AppError('CONFLICT', 'Esta aprovação não está mais pendente.');
    await tx
      .update(approvals)
      .set({ status: 'cancelled', pendingKey: null })
      .where(eq(approvals.id, approvalId));
    await tx
      .update(contents)
      .set({ status: 'internal_review' })
      .where(eq(contents.id, a.contentId));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'approval.cancelled',
      entityType: 'approval',
      entityId: approvalId,
      metadata: { contentId: a.contentId },
      ip: ctx.ip,
    });
  });
}

/** Reabre para edição um conteúdo já aprovado (a aprovação anterior fica como "substituída"). */
export async function reopenApproved(db: Db, ctx: Ctx, contentId: string) {
  const c = await loadForWrite(db, ctx, contentId, 'contents:approve');
  if (c.status !== 'approved')
    throw new AppError('CONFLICT', 'Só conteúdos aprovados podem ser reabertos para edição.');
  await db.transaction(async (tx) => {
    await tx
      .update(approvals)
      .set({ status: 'superseded' })
      .where(and(eq(approvals.contentId, contentId), eq(approvals.status, 'approved')));
    await tx.update(contents).set({ status: 'in_production' }).where(eq(contents.id, contentId));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'approval.reopened',
      entityType: 'content',
      entityId: contentId,
      ip: ctx.ip,
    });
  });
}

// ------------------------------------------------------------------- decisão
export async function decide(
  db: Db,
  ctx: Ctx,
  approvalId: string,
  decision: 'approved' | 'changes_requested',
  comment?: string,
) {
  const a = await loadApproval(db, ctx, approvalId);
  // só pessoas externas autorizadas decidem pelo cliente
  if (isInternal(ctx) || !can(ctx, 'approvals:approve', a.clientId)) throw forbidden();
  if (decision === 'changes_requested' && !comment?.trim())
    throw new AppError('VALIDATION', 'Descreva os ajustes desejados.', {
      comment: ['Descreva os ajustes desejados.'],
    });
  await db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, approvalId))
      .for('update');
    if (!cur || cur.status !== 'pending')
      throw new AppError('CONFLICT', 'Esta aprovação já foi decidida ou cancelada.');
    await tx
      .update(approvals)
      .set({
        status: decision,
        pendingKey: null,
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionComment: comment?.trim() || null,
      })
      .where(eq(approvals.id, approvalId));
    await tx
      .update(contents)
      .set({ status: decision === 'approved' ? 'approved' : 'changes_requested' })
      .where(eq(contents.id, a.contentId));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: decision === 'approved' ? 'approval.approved' : 'approval.changes_requested',
      entityType: 'approval',
      entityId: approvalId,
      metadata: { contentId: a.contentId, round: a.round },
      ip: ctx.ip,
    });
  });
  const [c] = await db
    .select({ title: contents.title, assignee: contents.assigneeUserId })
    .from(contents)
    .where(eq(contents.id, a.contentId));
  const targets = new Set([a.requestedBy, c?.assignee].filter((x): x is string => !!x));
  for (const userId of targets)
    await notify(db, {
      organizationId: ctx.organizationId,
      userId,
      type: 'approval_decided',
      title:
        decision === 'approved'
          ? `Cliente aprovou: ${c?.title ?? 'conteúdo'}`
          : `Cliente pediu ajustes: ${c?.title ?? 'conteúdo'}`,
      link: `/aprovacoes/${approvalId}`,
    });
}

export async function addApprovalComment(db: Db, ctx: Ctx, approvalId: string, body: string) {
  const a = await loadApproval(db, ctx, approvalId);
  if (a.status === 'superseded') throw new AppError('CONFLICT', 'Esta rodada foi substituída.');
  const id = newId();
  await db.insert(approvalComments).values({
    id,
    organizationId: ctx.organizationId,
    approvalId,
    authorId: ctx.userId,
    body,
  });
  const targets = isInternal(ctx)
    ? (await listApprovers(db, ctx.organizationId, a.clientId)).map((x) => x.userId)
    : [a.requestedBy].filter((x): x is string => !!x);
  for (const userId of new Set(targets))
    if (userId !== ctx.userId)
      await notify(db, {
        organizationId: ctx.organizationId,
        userId,
        type: 'approval_comment',
        title: 'Novo comentário em uma aprovação',
        link: `/aprovacoes/${approvalId}`,
      });
  return { id };
}

// ------------------------------------------------------------------ consulta
export async function listApprovals(
  db: Db,
  ctx: Ctx,
  f: { clientId?: string; status?: string; before?: string; limit?: number } = {},
) {
  requireAnyScope(ctx, 'approvals:view');
  const where: (SQL | undefined)[] = [visibleApprovals(ctx)];
  if (f.clientId) where.push(eq(approvals.clientId, f.clientId));
  if (f.status) where.push(eq(approvals.status, f.status as ApprovalStatus));
  if (f.before) where.push(lt(approvals.id, f.before));
  const limit = Math.min(f.limit ?? APPROVALS_PAGE_SIZE, 200);
  const rows = await db
    .select({
      a: approvals,
      title: contents.title,
      number: contents.number,
      format: contents.format,
      scheduledDate: contents.scheduledDate,
      clientName: clients.name,
    })
    .from(approvals)
    .innerJoin(contents, eq(contents.id, approvals.contentId))
    .innerJoin(clients, eq(clients.id, approvals.clientId))
    .where(and(...where))
    .orderBy(desc(approvals.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: page.map(({ a, title, number, format, scheduledDate, clientName }) => ({
      id: a.id,
      contentId: a.contentId,
      contentNumber: number,
      title,
      format,
      scheduledDate,
      clientId: a.clientId,
      clientName,
      round: a.round,
      status: a.status,
      requestedAt: a.requestedAt,
      decidedAt: a.decidedAt,
    })),
    nextBefore: rows.length > limit ? page[page.length - 1]!.a.id : null,
  };
}

export async function getApproval(db: Db, ctx: Ctx, id: string) {
  const a = await loadApproval(db, ctx, id);
  const [[c], [v], assetRows, comments, rounds, [requester], [decider]] = await Promise.all([
    db.select().from(contents).where(eq(contents.id, a.contentId)),
    db.select().from(contentVersions).where(eq(contentVersions.id, a.versionId)),
    db
      .select({ asset: assets, role: approvalAssets.role })
      .from(approvalAssets)
      .innerJoin(assets, eq(assets.id, approvalAssets.assetId))
      .where(eq(approvalAssets.approvalId, id)),
    db
      .select({ c: approvalComments, name: users.name, kind: users.kind })
      .from(approvalComments)
      .leftJoin(users, eq(users.id, approvalComments.authorId))
      .where(eq(approvalComments.approvalId, id))
      .orderBy(approvalComments.createdAt),
    db
      .select({
        id: approvals.id,
        round: approvals.round,
        status: approvals.status,
        decidedAt: approvals.decidedAt,
        decisionComment: approvals.decisionComment,
        requestedAt: approvals.requestedAt,
      })
      .from(approvals)
      .where(and(visibleApprovals(ctx), eq(approvals.contentId, a.contentId)))
      .orderBy(desc(approvals.round)),
    a.requestedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, a.requestedBy))
      : Promise.resolve([] as { name: string }[]),
    a.decidedBy
      ? db.select({ name: users.name }).from(users).where(eq(users.id, a.decidedBy))
      : Promise.resolve([] as { name: string }[]),
  ]);
  if (!c || !v) throw nf();
  const body = normalizeBody(v.body);
  const internal = isInternal(ctx);
  return {
    id: a.id,
    status: a.status,
    round: a.round,
    message: a.message,
    requestedAt: a.requestedAt,
    requestedByName: requester?.name ?? null,
    decidedAt: a.decidedAt,
    decidedByName: decider?.name ?? null,
    decisionComment: a.decisionComment,
    content: {
      id: c.id,
      number: c.number,
      title: c.title,
      format: c.format,
      scheduledDate: c.scheduledDate,
      scheduledTime: c.scheduledTime,
      status: c.status,
      clientId: c.clientId,
    },
    versionNumber: v.versionNumber,
    // externos veem só os campos voltados ao cliente; observações internas nunca saem daqui
    body: internal ? body : clientView(body),
    assets: assetRows.map(({ asset, role }) => ({
      id: asset.id,
      name: asset.displayName,
      kind: asset.kind,
      mime: asset.mime,
      sizeBytes: asset.sizeBytes,
      role,
    })),
    comments: comments.map(({ c: cm, name, kind }) => ({
      id: cm.id,
      body: cm.body,
      authorName: name,
      fromClient: kind === 'external',
      createdAt: cm.createdAt,
    })),
    rounds,
    permissions: {
      decide: !internal && a.status === 'pending' && can(ctx, 'approvals:approve', a.clientId),
      cancel: internal && a.status === 'pending' && can(ctx, 'contents:approve', a.clientId),
      comment: a.status !== 'superseded',
    },
  };
}

/** Arquivo congelado na rodada, entregue sob a autorização da aprovação (clientes não acessam a biblioteca). */
export async function readApprovalAsset(
  db: Db,
  storage: StorageDriver,
  ctx: Ctx,
  approvalId: string,
  assetId: string,
) {
  const a = await loadApproval(db, ctx, approvalId);
  const [row] = await db
    .select({ asset: assets })
    .from(approvalAssets)
    .innerJoin(assets, eq(assets.id, approvalAssets.assetId))
    .where(
      and(
        eq(approvalAssets.approvalId, a.id),
        eq(approvalAssets.assetId, assetId),
        eq(assets.organizationId, ctx.organizationId),
      ),
    );
  if (!row) throw new AppError('NOT_FOUND', 'Arquivo não encontrado.');
  return readAssetBytes(storage, row.asset);
}

/** Aprovações de um conteúdo (visão interna, aba "Aprovação"). */
export async function listContentApprovals(db: Db, ctx: Ctx, contentId: string) {
  await loadForWrite(db, ctx, contentId, 'contents:view');
  requireAnyScope(ctx, 'approvals:view');
  const rows = await db
    .select({ a: approvals, decider: users.name })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.decidedBy))
    .where(and(visibleApprovals(ctx), eq(approvals.contentId, contentId)))
    .orderBy(desc(approvals.round));
  return rows.map(({ a, decider }) => ({
    id: a.id,
    round: a.round,
    status: a.status,
    message: a.message,
    requestedAt: a.requestedAt,
    decidedAt: a.decidedAt,
    decidedByName: decider,
    decisionComment: a.decisionComment,
  }));
}
