import { and, desc, eq, isNull, or, inArray, max } from 'drizzle-orm';
import type { Db } from '@/db';
import {
  contentDrafts,
  contentTemplates,
  contentVersions,
  contents,
  textBlocks,
  users,
  socialProfiles,
  type EditorBody,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { can, requireAnyScope, type Ctx } from '@/core/auth/context';
import { isDuplicateEntry } from '@/core/db';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { loadForWrite } from '@/modules/contents/service';
import { visibleContents } from '@/modules/contents/service';
import { bodiesEqual, diffBodies, limitReports, missingForFormat, normalizeBody } from './rules';

const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
const nf = (what: string) => new AppError('NOT_FOUND', `${what} não encontrado.`);
const EDIT_BLOCKED = ['published', 'archived'];

async function loadContent(db: Db, ctx: Ctx, id: string, perm: string) {
  const c = await loadForWrite(db, ctx, id, perm); // 404 se fora do escopo; 403 se sem permissão; só equipe interna
  return c;
}

export async function getEditor(db: Db, ctx: Ctx, contentId: string) {
  const c = await loadContent(db, ctx, contentId, 'contents:view');
  const [draft] = await db
    .select({ d: contentDrafts, name: users.name })
    .from(contentDrafts)
    .leftJoin(users, eq(users.id, contentDrafts.updatedBy))
    .where(
      and(
        eq(contentDrafts.contentId, contentId),
        eq(contentDrafts.organizationId, ctx.organizationId),
      ),
    );
  const [profile] = c.socialProfileId
    ? await db
        .select({ network: socialProfiles.network })
        .from(socialProfiles)
        .where(eq(socialProfiles.id, c.socialProfileId))
    : [];
  const body = normalizeBody(draft?.d.body);
  const versions = await listVersions(db, ctx, contentId);
  const latest = versions[0];
  let unsaved = true;
  if (latest) {
    const [lv] = await db
      .select({ body: contentVersions.body })
      .from(contentVersions)
      .where(eq(contentVersions.id, latest.id));
    unsaved = !bodiesEqual(body, normalizeBody(lv?.body));
  } else unsaved = !bodiesEqual(body, normalizeBody(null));
  return {
    content: {
      id: c.id,
      number: c.number,
      title: c.title,
      format: c.format,
      status: c.status,
      clientId: c.clientId,
    },
    network: profile?.network ?? null,
    draft: {
      body,
      revision: draft?.d.revision ?? 0,
      updatedAt: draft?.d.updatedAt ?? null,
      updatedByName: draft?.name ?? null,
    },
    unsavedChanges: unsaved,
    versions,
    warnings: {
      missing: missingForFormat(c.format, body),
      limits: limitReports(profile?.network ?? null, body),
    },
    canEdit: can(ctx, 'contents:edit', c.clientId) && !EDIT_BLOCKED.includes(c.status),
  };
}

/** Autosave do rascunho de trabalho, com controle otimista de concorrência (`baseRevision`). */
export async function saveDraft(
  db: Db,
  ctx: Ctx,
  contentId: string,
  baseRevision: number,
  input: EditorBody,
) {
  const c = await loadContent(db, ctx, contentId, 'contents:edit');
  if (EDIT_BLOCKED.includes(c.status))
    throw new AppError('CONFLICT', 'Este conteúdo não pode mais ser editado nesta situação.');
  const body = normalizeBody(input);
  return db.transaction(async (tx) => {
    const [cur] = await tx
      .select()
      .from(contentDrafts)
      .where(eq(contentDrafts.contentId, contentId))
      .for('update');
    if (!cur) {
      if (baseRevision !== 0)
        throw new AppError('CONFLICT', 'O rascunho mudou. Recarregue a página.', {
          revision: ['0'],
        });
      await tx.insert(contentDrafts).values({
        contentId,
        organizationId: ctx.organizationId,
        body,
        revision: 1,
        updatedBy: ctx.userId,
      });
      return { revision: 1, updatedAt: new Date() };
    }
    if (cur.revision !== baseRevision) {
      throw new AppError(
        'CONFLICT',
        'Outra pessoa alterou este rascunho. Recarregue para ver a versão mais recente antes de continuar.',
        { revision: [String(cur.revision)] },
      );
    }
    await tx
      .update(contentDrafts)
      .set({ body, revision: cur.revision + 1, updatedBy: ctx.userId })
      .where(eq(contentDrafts.contentId, contentId));
    return { revision: cur.revision + 1, updatedAt: new Date() };
  });
}

export async function listVersions(db: Db, ctx: Ctx, contentId: string) {
  requireAnyScope(ctx, 'contents:view');
  const [c] = await db
    .select({ id: contents.id })
    .from(contents)
    .where(and(visibleContents(ctx), eq(contents.id, contentId)));
  if (!c || ctx.userKind !== 'internal') throw nf('Conteúdo');
  const rows = await db
    .select({ v: contentVersions, name: users.name })
    .from(contentVersions)
    .leftJoin(users, eq(users.id, contentVersions.createdBy))
    .where(
      and(
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.organizationId, ctx.organizationId),
      ),
    )
    .orderBy(desc(contentVersions.versionNumber));
  return rows.map(({ v, name }) => ({
    id: v.id,
    number: v.versionNumber,
    note: v.note,
    source: v.source,
    restoredFrom: v.restoredFrom,
    createdAt: v.createdAt,
    createdByName: name,
  }));
}

/** Congela o rascunho atual como uma versão numerada e imutável. */
export async function saveVersion(db: Db, ctx: Ctx, contentId: string, note?: string) {
  const c = await loadContent(db, ctx, contentId, 'contents:edit');
  if (EDIT_BLOCKED.includes(c.status))
    throw new AppError('CONFLICT', 'Este conteúdo não pode mais ser editado nesta situação.');
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(contentDrafts)
          .where(eq(contentDrafts.contentId, contentId))
          .for('update');
        if (!draft) throw new AppError('CONFLICT', 'Não há rascunho para salvar como versão.');
        const [last] = await tx
          .select()
          .from(contentVersions)
          .where(eq(contentVersions.contentId, contentId))
          .orderBy(desc(contentVersions.versionNumber))
          .limit(1);
        if (last && bodiesEqual(normalizeBody(last.body), normalizeBody(draft.body)))
          throw new AppError('CONFLICT', 'Não há alterações desde a última versão.');
        const [m] = await tx
          .select({ n: max(contentVersions.versionNumber) })
          .from(contentVersions)
          .where(eq(contentVersions.contentId, contentId));
        const number = (m?.n ?? 0) + 1;
        const id = newId();
        await tx.insert(contentVersions).values({
          id,
          organizationId: ctx.organizationId,
          contentId,
          versionNumber: number,
          body: normalizeBody(draft.body),
          note: note?.trim() || null,
          source: 'human',
          createdBy: ctx.userId,
        });
        await audit(tx, {
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId,
          action: 'content.version_saved',
          entityType: 'content',
          entityId: contentId,
          metadata: { version: number, note: note?.trim() || null },
          ip: ctx.ip,
        });
        return { id, number };
      });
    } catch (e) {
      if (isDuplicateEntry(e) && attempt < 2) continue; // corrida entre duas versões simultâneas
      throw e;
    }
  }
  throw new AppError('CONFLICT', 'Não foi possível salvar a versão. Tente novamente.');
}

async function loadVersion(db: Db, ctx: Ctx, contentId: string, number: number) {
  const [v] = await db
    .select()
    .from(contentVersions)
    .where(
      and(
        eq(contentVersions.contentId, contentId),
        eq(contentVersions.versionNumber, number),
        eq(contentVersions.organizationId, ctx.organizationId),
      ),
    );
  if (!v) throw nf('Versão');
  return v;
}

export async function getVersion(db: Db, ctx: Ctx, contentId: string, number: number) {
  await loadContent(db, ctx, contentId, 'contents:view');
  const v = await loadVersion(db, ctx, contentId, number);
  return {
    id: v.id,
    number: v.versionNumber,
    note: v.note,
    source: v.source,
    createdAt: v.createdAt,
    body: normalizeBody(v.body),
  };
}

export async function compareVersions(db: Db, ctx: Ctx, contentId: string, a: number, b: number) {
  await loadContent(db, ctx, contentId, 'contents:view');
  const [va, vb] = await Promise.all([
    loadVersion(db, ctx, contentId, a),
    loadVersion(db, ctx, contentId, b),
  ]);
  return { a, b, diffs: diffBodies(normalizeBody(va.body), normalizeBody(vb.body)) };
}

/** Restaurar copia a versão para o rascunho (não apaga nem altera versões existentes). */
export async function restoreVersion(
  db: Db,
  ctx: Ctx,
  contentId: string,
  number: number,
  baseRevision: number,
) {
  const c = await loadContent(db, ctx, contentId, 'contents:edit');
  if (EDIT_BLOCKED.includes(c.status))
    throw new AppError('CONFLICT', 'Este conteúdo não pode mais ser editado nesta situação.');
  const v = await loadVersion(db, ctx, contentId, number);
  const out = await saveDraft(db, ctx, contentId, baseRevision, normalizeBody(v.body));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'content.version_restored',
    entityType: 'content',
    entityId: contentId,
    metadata: { version: number },
    ip: ctx.ip,
  });
  return out;
}

// ------------------------------------------------------------- blocos e modelos
const clientFilter = (ctx: Ctx, col: typeof textBlocks.clientId) => {
  const scoped = ctx.grants.filter((g) => g.permissions.has('contents:view'));
  const all = scoped.some((g) => g.clientId === null);
  if (all) return undefined;
  const ids = [...new Set(scoped.map((g) => g.clientId!))];
  return ids.length ? or(isNull(col), inArray(col, ids)) : isNull(col);
};

export async function listBlocks(db: Db, ctx: Ctx) {
  requireAnyScope(ctx, 'contents:view');
  if (ctx.userKind !== 'internal') throw forbidden();
  return db
    .select({
      id: textBlocks.id,
      name: textBlocks.name,
      kind: textBlocks.kind,
      text: textBlocks.text,
      clientId: textBlocks.clientId,
    })
    .from(textBlocks)
    .where(
      and(
        eq(textBlocks.organizationId, ctx.organizationId),
        isNull(textBlocks.deletedAt),
        clientFilter(ctx, textBlocks.clientId),
      ),
    )
    .orderBy(textBlocks.name);
}

function assertCanCreateShared(ctx: Ctx, clientId: string | null | undefined) {
  if (ctx.userKind !== 'internal') throw forbidden();
  if (
    clientId
      ? !can(ctx, 'contents:create', clientId)
      : !ctx.grants.some((g) => g.clientId === null && g.permissions.has('contents:create'))
  )
    throw forbidden();
}

export async function saveBlock(
  db: Db,
  ctx: Ctx,
  id: string | null,
  input: {
    name: string;
    kind: 'cta' | 'hashtags' | 'disclaimer' | 'signature' | 'other';
    text: string;
    clientId?: string | null;
  },
) {
  assertCanCreateShared(ctx, input.clientId);
  const bid = id ?? newId();
  if (input.clientId) {
    const { loadClient } = await import('@/modules/clients/service');
    await loadClient(db, ctx, input.clientId);
  }
  if (id) {
    const [b] = await db
      .select()
      .from(textBlocks)
      .where(
        and(
          eq(textBlocks.id, id),
          eq(textBlocks.organizationId, ctx.organizationId),
          isNull(textBlocks.deletedAt),
          clientFilter(ctx, textBlocks.clientId),
        ),
      );
    if (!b) throw nf('Bloco');
    assertCanCreateShared(ctx, b.clientId);
    await db
      .update(textBlocks)
      .set({
        name: input.name,
        kind: input.kind,
        text: input.text,
        clientId: input.clientId ?? null,
      })
      .where(eq(textBlocks.id, id));
  } else {
    await db.insert(textBlocks).values({
      id: bid,
      organizationId: ctx.organizationId,
      clientId: input.clientId ?? null,
      name: input.name,
      kind: input.kind,
      text: input.text,
      createdBy: ctx.userId,
    });
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: id ? 'block.updated' : 'block.created',
    entityType: 'block',
    entityId: bid,
    metadata: { name: input.name },
    ip: ctx.ip,
  });
  return { id: bid };
}

export async function deleteBlock(db: Db, ctx: Ctx, id: string) {
  const [b] = await db
    .select()
    .from(textBlocks)
    .where(
      and(
        eq(textBlocks.id, id),
        eq(textBlocks.organizationId, ctx.organizationId),
        isNull(textBlocks.deletedAt),
        clientFilter(ctx, textBlocks.clientId),
      ),
    );
  if (!b) throw nf('Bloco');
  const allowed =
    b.createdBy === ctx.userId ||
    (b.clientId
      ? can(ctx, 'contents:delete', b.clientId)
      : ctx.grants.some((g) => g.clientId === null && g.permissions.has('contents:delete')));
  if (!allowed || ctx.userKind !== 'internal') throw forbidden();
  await db.update(textBlocks).set({ deletedAt: new Date() }).where(eq(textBlocks.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'block.deleted',
    entityType: 'block',
    entityId: id,
    ip: ctx.ip,
  });
}

export async function listTemplates(db: Db, ctx: Ctx, format?: string) {
  requireAnyScope(ctx, 'contents:view');
  if (ctx.userKind !== 'internal') throw forbidden();
  const where = [
    eq(contentTemplates.organizationId, ctx.organizationId),
    isNull(contentTemplates.deletedAt),
    clientFilter(ctx, contentTemplates.clientId as never),
  ];
  const rows = await db
    .select()
    .from(contentTemplates)
    .where(and(...where))
    .orderBy(contentTemplates.name);
  return rows
    .filter((t) => !format || !t.format || t.format === format)
    .map((t) => ({
      id: t.id,
      name: t.name,
      format: t.format,
      clientId: t.clientId,
      body: normalizeBody(t.body),
    }));
}

/** Cria um modelo a partir de um corpo informado ou do rascunho de um conteúdo (ids/anexos não são copiados). */
export async function createTemplate(
  db: Db,
  ctx: Ctx,
  input: {
    name: string;
    format?: string | null;
    clientId?: string | null;
    fromContentId?: string;
    body?: EditorBody;
  },
) {
  assertCanCreateShared(ctx, input.clientId);
  let body = input.body ? normalizeBody(input.body) : null;
  let format = input.format ?? null;
  if (!body && input.fromContentId) {
    const c = await loadContent(db, ctx, input.fromContentId, 'contents:view');
    const [d] = await db.select().from(contentDrafts).where(eq(contentDrafts.contentId, c.id));
    body = normalizeBody(d?.body);
    format = format ?? c.format;
  }
  if (!body)
    throw new AppError('VALIDATION', 'Informe o conteúdo do modelo.', {
      body: ['Informe o corpo ou o conteúdo de origem.'],
    });
  body = { ...body, checklist: [] };
  const [dup] = await db
    .select({ id: contentTemplates.id })
    .from(contentTemplates)
    .where(
      and(
        eq(contentTemplates.organizationId, ctx.organizationId),
        isNull(contentTemplates.deletedAt),
        eq(contentTemplates.name, input.name),
        input.clientId
          ? eq(contentTemplates.clientId, input.clientId)
          : isNull(contentTemplates.clientId),
      ),
    )
    .limit(1);
  if (dup) throw new AppError('CONFLICT', 'Já existe um modelo com este nome.');
  const id = newId();
  try {
    await db.insert(contentTemplates).values({
      id,
      organizationId: ctx.organizationId,
      clientId: input.clientId ?? null,
      name: input.name,
      format,
      body,
      createdBy: ctx.userId,
    });
  } catch (e) {
    if (isDuplicateEntry(e)) throw new AppError('CONFLICT', 'Já existe um modelo com este nome.');
    throw e;
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'template.created',
    entityType: 'template',
    entityId: id,
    metadata: { name: input.name },
    ip: ctx.ip,
  });
  return { id };
}

export async function deleteTemplate(db: Db, ctx: Ctx, id: string) {
  const [t] = await db
    .select()
    .from(contentTemplates)
    .where(
      and(
        eq(contentTemplates.id, id),
        eq(contentTemplates.organizationId, ctx.organizationId),
        isNull(contentTemplates.deletedAt),
        clientFilter(ctx, contentTemplates.clientId as never),
      ),
    );
  if (!t) throw nf('Modelo');
  const allowed =
    t.createdBy === ctx.userId ||
    (t.clientId
      ? can(ctx, 'contents:delete', t.clientId)
      : ctx.grants.some((g) => g.clientId === null && g.permissions.has('contents:delete')));
  if (!allowed || ctx.userKind !== 'internal') throw forbidden();
  await db
    .update(contentTemplates)
    .set({ deletedAt: new Date() })
    .where(eq(contentTemplates.id, id));
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'template.deleted',
    entityType: 'template',
    entityId: id,
    ip: ctx.ip,
  });
}
