import { createHash } from 'node:crypto';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '@/db';
import {
  assetFavorites,
  assetFolders,
  assetTags,
  assets,
  brands,
  clients,
  contentAssets,
  contents,
  organizations,
  users,
} from '@/db/schema';
import { audit } from '@/core/audit';
import { can, clientScope, requireAnyScope, type Ctx } from '@/core/auth/context';
import { isDuplicateEntry } from '@/core/db';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { createLogger } from '@/core/logger';
import type { StorageDriver } from '@/integrations/storage/types';
import { loadClient, likePattern } from '@/modules/clients/service';
import { loadForWrite, visibleContents } from '@/modules/contents/service';
import { detectFile, normalizeTag, sanitizeFileName, storageKeyFor } from './files';

export const TRASH_RETENTION_DAYS = 30;
export const ASSETS_PAGE_SIZE = 40;
const nf = (what = 'Arquivo') => new AppError('NOT_FOUND', `${what} não encontrado.`);
const forbidden = () => new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');

/**
 * Condição base de TODA consulta da biblioteca: organização + escopo de cliente de `library:view`.
 * Externos NÃO acessam a biblioteca interna; arquivos compartilhados com o cliente chegam pelo portal (Etapa 08).
 */
export function visibleAssets(ctx: Ctx) {
  const scope = clientScope(ctx, 'library:view');
  const base: (SQL | undefined)[] = [eq(assets.organizationId, ctx.organizationId)];
  if (ctx.userKind !== 'internal') return and(...base, eq(assets.id, '__none__'));
  if (scope.all) return and(...base);
  if (scope.clientIds.length === 0) return and(...base, eq(assets.id, '__none__'));
  return and(...base, inArray(assets.clientId, scope.clientIds));
}

type AssetRow = typeof assets.$inferSelect;

async function loadAsset(
  db: Db,
  ctx: Ctx,
  id: string,
  perm = 'library:view',
  opts: { includeTrash?: boolean } = {},
): Promise<AssetRow> {
  const where = [visibleAssets(ctx), eq(assets.id, id)];
  if (!opts.includeTrash) where.push(isNull(assets.deletedAt));
  const [a] = await db
    .select()
    .from(assets)
    .where(and(...where))
    .limit(1);
  if (!a) throw nf();
  if (perm !== 'library:view' && !can(ctx, perm, a.clientId)) throw forbidden();
  return a;
}

function cleanTags(tags: string[] | undefined): string[] {
  const out = [...new Set((tags ?? []).map(normalizeTag).filter((t): t is string => !!t))];
  if (out.length > 20)
    throw new AppError('VALIDATION', 'No máximo 20 tags por arquivo.', {
      tags: ['No máximo 20 tags.'],
    });
  return out;
}

// --------------------------------------------------------------------- uso
export async function storageUsage(db: Db, ctx: Ctx) {
  requireAnyScope(ctx, 'library:view');
  const [row] = await db
    .select({ used: sql<number>`COALESCE(SUM(${assets.sizeBytes}), 0)` })
    .from(assets)
    .where(eq(assets.organizationId, ctx.organizationId));
  const [org] = await db
    .select({ limit: organizations.storageLimitMb })
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId));
  return { usedBytes: Number(row?.used ?? 0), limitBytes: (org?.limit ?? 5120) * 1024 * 1024 };
}

// ------------------------------------------------------------------ upload
export interface UploadInput {
  clientId: string;
  brandId?: string | null;
  folderId?: string | null;
  file: { name: string; data: Buffer };
  displayName?: string | null;
  description?: string | null;
  credits?: string | null;
  origin?: string | null;
  tags?: string[];
}

async function validateTargets(
  db: Db,
  ctx: Ctx,
  clientId: string,
  brandId?: string | null,
  folderId?: string | null,
) {
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
  if (folderId) {
    const [f] = await db
      .select({ id: assetFolders.id })
      .from(assetFolders)
      .where(
        and(
          eq(assetFolders.id, folderId),
          eq(assetFolders.clientId, clientId),
          eq(assetFolders.organizationId, ctx.organizationId),
          isNull(assetFolders.deletedAt),
        ),
      );
    if (!f)
      throw new AppError('VALIDATION', 'Pasta inválida para este cliente.', {
        folderId: ['Escolha uma pasta do cliente.'],
      });
  }
}

export async function uploadAsset(
  db: Db,
  storage: StorageDriver,
  ctx: Ctx,
  input: UploadInput,
  opts: { maxBytes: number },
) {
  if (ctx.userKind !== 'internal') throw forbidden();
  await loadClient(db, ctx, input.clientId); // 404 se fora do escopo
  if (!can(ctx, 'library:create', input.clientId)) throw forbidden();
  await validateTargets(db, ctx, input.clientId, input.brandId, input.folderId);
  const { data } = input.file;
  if (data.length === 0)
    throw new AppError('VALIDATION', 'O arquivo está vazio.', { file: ['Arquivo vazio.'] });
  if (data.length > opts.maxBytes)
    throw new AppError(
      'VALIDATION',
      `O arquivo excede o limite de ${Math.round(opts.maxBytes / 1048576)} MB.`,
      { file: ['Arquivo muito grande.'] },
    );
  const detected = detectFile(data, input.file.name);
  if (!detected)
    throw new AppError(
      'VALIDATION',
      'Tipo de arquivo não permitido. Aceitamos imagens (PNG, JPG, GIF, WebP), vídeos (MP4, MOV, WebM), PDF, DOCX, XLSX, PPTX, TXT, CSV e MD.',
      { file: ['Tipo não permitido.'] },
    );
  const tags = cleanTags(input.tags);
  const sha = createHash('sha256').update(data).digest('hex');

  const dup = await db
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.organizationId, ctx.organizationId),
        eq(assets.clientId, input.clientId),
        eq(assets.sha256, sha),
        isNull(assets.deletedAt),
      ),
    )
    .limit(1);
  if (dup[0]) return { id: dup[0].id, duplicate: true as const };

  const usage = await storageUsage(db, ctx);
  if (usage.usedBytes + data.length > usage.limitBytes)
    throw new AppError('VALIDATION', 'O limite de armazenamento da organização foi atingido.', {
      file: ['Limite de armazenamento atingido.'],
    });

  const id = newId();
  const key = storageKeyFor(ctx.organizationId, input.clientId, id, detected.ext);
  const original = sanitizeFileName(input.file.name);
  await storage.put(key, data);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        id,
        organizationId: ctx.organizationId,
        clientId: input.clientId,
        brandId: input.brandId ?? null,
        folderId: input.folderId ?? null,
        rootAssetId: id,
        versionNumber: 1,
        isLatest: 1,
        displayName: (input.displayName?.trim() || original).slice(0, 190),
        originalName: original,
        mime: detected.mime,
        kind: detected.kind,
        sizeBytes: data.length,
        sha256: sha,
        storageKey: key,
        description: input.description?.trim() || null,
        credits: input.credits?.trim() || null,
        origin: input.origin?.trim() || null,
        uploadedBy: ctx.userId,
      });
      if (tags.length) await tx.insert(assetTags).values(tags.map((tag) => ({ assetId: id, tag })));
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'asset.uploaded',
        entityType: 'asset',
        entityId: id,
        metadata: {
          name: original,
          kind: detected.kind,
          size: data.length,
          clientId: input.clientId,
        },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    await storage.delete(key).catch(() => undefined); // não deixa arquivo órfão se o banco falhar
    throw e;
  }
  return { id, duplicate: false as const };
}

/** Nova versão de um arquivo: mantém cliente, marca, pasta, metadados e tags; a versão anterior continua acessível. */
export async function uploadAssetVersion(
  db: Db,
  storage: StorageDriver,
  ctx: Ctx,
  assetId: string,
  file: { name: string; data: Buffer },
  opts: { maxBytes: number },
) {
  const prev = await loadAsset(db, ctx, assetId, 'library:edit');
  if (!prev.isLatest)
    throw new AppError('CONFLICT', 'Envie a nova versão a partir da versão mais recente.');
  const { data } = file;
  if (data.length === 0 || data.length > opts.maxBytes)
    throw new AppError('VALIDATION', 'Arquivo vazio ou acima do limite.', {
      file: ['Arquivo inválido.'],
    });
  const detected = detectFile(data, file.name);
  if (!detected)
    throw new AppError('VALIDATION', 'Tipo de arquivo não permitido.', {
      file: ['Tipo não permitido.'],
    });
  if (detected.kind !== prev.kind)
    throw new AppError(
      'VALIDATION',
      'A nova versão precisa ser do mesmo tipo (imagem, vídeo ou documento).',
      { file: ['Tipo diferente da versão atual.'] },
    );
  const sha = createHash('sha256').update(data).digest('hex');
  if (sha === prev.sha256) throw new AppError('CONFLICT', 'O arquivo é idêntico à versão atual.');
  const usage = await storageUsage(db, ctx);
  if (usage.usedBytes + data.length > usage.limitBytes)
    throw new AppError('VALIDATION', 'O limite de armazenamento da organização foi atingido.', {
      file: ['Limite de armazenamento atingido.'],
    });

  const id = newId();
  const key = storageKeyFor(ctx.organizationId, prev.clientId, id, detected.ext);
  await storage.put(key, data);
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ isLatest: 0 })
        .where(
          and(
            eq(assets.rootAssetId, prev.rootAssetId),
            eq(assets.organizationId, ctx.organizationId),
          ),
        );
      await tx.insert(assets).values({
        id,
        organizationId: ctx.organizationId,
        clientId: prev.clientId,
        brandId: prev.brandId,
        folderId: prev.folderId,
        rootAssetId: prev.rootAssetId,
        versionNumber: prev.versionNumber + 1,
        isLatest: 1,
        displayName: prev.displayName,
        originalName: sanitizeFileName(file.name),
        mime: detected.mime,
        kind: detected.kind,
        sizeBytes: data.length,
        sha256: sha,
        storageKey: key,
        description: prev.description,
        credits: prev.credits,
        origin: prev.origin,
        uploadedBy: ctx.userId,
      });
      const tags = await tx
        .select({ tag: assetTags.tag })
        .from(assetTags)
        .where(eq(assetTags.assetId, prev.id));
      if (tags.length)
        await tx.insert(assetTags).values(tags.map((t) => ({ assetId: id, tag: t.tag })));
      // arquivos de conteúdo apontam para a versão mais recente
      await tx
        .update(contentAssets)
        .set({ assetId: id })
        .where(eq(contentAssets.assetId, prev.id))
        .catch(() => undefined);
      await audit(tx, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.userId,
        action: 'asset.version_uploaded',
        entityType: 'asset',
        entityId: id,
        metadata: { root: prev.rootAssetId, version: prev.versionNumber + 1 },
        ip: ctx.ip,
      });
    });
  } catch (e) {
    await storage.delete(key).catch(() => undefined);
    throw e;
  }
  return { id, version: prev.versionNumber + 1 };
}

// ----------------------------------------------------------------- consulta
export interface AssetFilters {
  clientId?: string;
  brandId?: string;
  folderId?: string | 'root';
  kind?: string;
  q?: string;
  tag?: string;
  favorites?: boolean;
  unlinked?: boolean;
  trash?: boolean;
  before?: string;
  limit?: number;
}

export async function listAssets(db: Db, ctx: Ctx, f: AssetFilters = {}) {
  requireAnyScope(ctx, 'library:view');
  if (ctx.userKind !== 'internal') return { items: [], nextBefore: null };
  const limit = f.limit ?? ASSETS_PAGE_SIZE;
  const where: (SQL | undefined)[] = [
    visibleAssets(ctx),
    f.trash ? isNotNull(assets.deletedAt) : isNull(assets.deletedAt),
  ];
  if (!f.trash) where.push(eq(assets.isLatest, 1));
  if (f.clientId) where.push(eq(assets.clientId, f.clientId));
  if (f.brandId) where.push(eq(assets.brandId, f.brandId));
  if (f.folderId === 'root') where.push(isNull(assets.folderId));
  else if (f.folderId) where.push(eq(assets.folderId, f.folderId));
  if (f.kind) where.push(eq(assets.kind, f.kind as 'image'));
  if (f.before) where.push(lt(assets.id, f.before));
  if (f.q?.trim()) {
    const p = likePattern(f.q.trim());
    where.push(
      or(
        like(assets.displayName, p),
        like(assets.description, p),
        like(assets.originalName, p),
        sql`EXISTS (SELECT 1 FROM ${assetTags} WHERE ${assetTags.assetId} = ${assets.id} AND ${assetTags.tag} LIKE ${p})`,
      ),
    );
  }
  if (f.tag)
    where.push(
      sql`EXISTS (SELECT 1 FROM ${assetTags} WHERE ${assetTags.assetId} = ${assets.id} AND ${assetTags.tag} = ${f.tag})`,
    );
  if (f.favorites)
    where.push(
      sql`EXISTS (SELECT 1 FROM ${assetFavorites} WHERE ${assetFavorites.assetId} = ${assets.id} AND ${assetFavorites.userId} = ${ctx.userId})`,
    );
  if (f.unlinked)
    where.push(
      sql`NOT EXISTS (SELECT 1 FROM ${contentAssets} WHERE ${contentAssets.assetId} = ${assets.id})`,
    );

  const rows = await db
    .select({ a: assets, clientName: clients.name, uploader: users.name })
    .from(assets)
    .innerJoin(clients, eq(clients.id, assets.clientId))
    .leftJoin(users, eq(users.id, assets.uploadedBy))
    .where(and(...where))
    .orderBy(desc(assets.id))
    .limit(limit + 1);
  const page = rows.length > limit ? rows.slice(0, limit) : rows;
  const ids = page.map((r) => r.a.id);
  const [tagRows, favRows, useRows] = ids.length
    ? await Promise.all([
        db.select().from(assetTags).where(inArray(assetTags.assetId, ids)),
        db
          .select({ assetId: assetFavorites.assetId })
          .from(assetFavorites)
          .where(and(inArray(assetFavorites.assetId, ids), eq(assetFavorites.userId, ctx.userId))),
        db
          .select({ assetId: contentAssets.assetId, n: sql<number>`count(*)` })
          .from(contentAssets)
          .where(inArray(contentAssets.assetId, ids))
          .groupBy(contentAssets.assetId),
      ])
    : [[], [], []];
  const tagsBy = new Map<string, string[]>();
  for (const t of tagRows) tagsBy.set(t.assetId, [...(tagsBy.get(t.assetId) ?? []), t.tag]);
  const favs = new Set(favRows.map((r) => r.assetId));
  const uses = new Map(useRows.map((r) => [r.assetId, Number(r.n)]));
  const items = page.map(({ a, clientName, uploader }) => ({
    id: a.id,
    displayName: a.displayName,
    kind: a.kind,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    clientId: a.clientId,
    clientName,
    brandId: a.brandId,
    folderId: a.folderId,
    versionNumber: a.versionNumber,
    tags: (tagsBy.get(a.id) ?? []).sort(),
    favorite: favs.has(a.id),
    usedIn: uses.get(a.id) ?? 0,
    uploadedByName: uploader,
    createdAt: a.createdAt,
    deletedAt: a.deletedAt,
  }));
  return { items, nextBefore: rows.length > limit ? items[items.length - 1]!.id : null };
}

export async function getAsset(
  db: Db,
  ctx: Ctx,
  id: string,
  opts: { includeTrash?: boolean } = {},
) {
  const a = await loadAsset(db, ctx, id, 'library:view', opts);
  const [tagRows, [fav], versions, links, [client], [brand]] = await Promise.all([
    db.select({ tag: assetTags.tag }).from(assetTags).where(eq(assetTags.assetId, id)),
    db
      .select()
      .from(assetFavorites)
      .where(and(eq(assetFavorites.assetId, id), eq(assetFavorites.userId, ctx.userId))),
    db
      .select({
        id: assets.id,
        versionNumber: assets.versionNumber,
        sizeBytes: assets.sizeBytes,
        createdAt: assets.createdAt,
        isLatest: assets.isLatest,
        uploader: users.name,
      })
      .from(assets)
      .leftJoin(users, eq(users.id, assets.uploadedBy))
      .where(
        and(eq(assets.rootAssetId, a.rootAssetId), eq(assets.organizationId, ctx.organizationId)),
      )
      .orderBy(desc(assets.versionNumber)),
    db
      .select({
        contentId: contents.id,
        number: contents.number,
        title: contents.title,
        role: contentAssets.role,
      })
      .from(contentAssets)
      .innerJoin(contents, eq(contents.id, contentAssets.contentId))
      .where(and(eq(contentAssets.assetId, id), visibleContents(ctx))),
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, a.clientId)),
    a.brandId
      ? db.select({ name: brands.name }).from(brands).where(eq(brands.id, a.brandId))
      : Promise.resolve([] as { name: string }[]),
  ]);
  return {
    id: a.id,
    displayName: a.displayName,
    originalName: a.originalName,
    mime: a.mime,
    kind: a.kind,
    sizeBytes: a.sizeBytes,
    sha256: a.sha256,
    description: a.description,
    credits: a.credits,
    origin: a.origin,
    clientId: a.clientId,
    clientName: client?.name ?? '',
    brandId: a.brandId,
    brandName: brand?.name ?? null,
    folderId: a.folderId,
    versionNumber: a.versionNumber,
    isLatest: a.isLatest === 1,
    rootAssetId: a.rootAssetId,
    tags: tagRows.map((t) => t.tag).sort(),
    favorite: !!fav,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.versionNumber,
      sizeBytes: v.sizeBytes,
      createdAt: v.createdAt,
      latest: v.isLatest === 1,
      uploadedByName: v.uploader,
    })),
    usedIn: links,
    createdAt: a.createdAt,
    deletedAt: a.deletedAt,
    permissions: {
      edit: can(ctx, 'library:edit', a.clientId),
      delete: can(ctx, 'library:delete', a.clientId),
      create: can(ctx, 'library:create', a.clientId),
    },
  };
}

/** Conteúdo do arquivo para entrega. Passa pelo mesmo controle de escopo; arquivos na lixeira não são servidos. */
export async function readAssetFile(db: Db, storage: StorageDriver, ctx: Ctx, id: string) {
  return readAssetBytes(storage, await loadAsset(db, ctx, id));
}

/** Lê os bytes de um arquivo já autorizado por quem chama (biblioteca ou aprovação). */
export async function readAssetBytes(storage: StorageDriver, a: AssetRow) {
  const data = await storage.get(a.storageKey);
  return {
    mime: a.mime,
    kind: a.kind,
    name: a.displayName.replace(/[^\w.\-() ]+/g, '_') || 'arquivo',
    ext: a.storageKey.split('.').pop()!,
    data,
  };
}

// ------------------------------------------------------------------ edição
export interface AssetPatch {
  displayName?: string;
  description?: string | null;
  credits?: string | null;
  origin?: string | null;
  brandId?: string | null;
  folderId?: string | null;
  tags?: string[];
}

export async function updateAsset(db: Db, ctx: Ctx, id: string, patch: AssetPatch) {
  const a = await loadAsset(db, ctx, id, 'library:edit');
  await validateTargets(db, ctx, a.clientId, patch.brandId, patch.folderId);
  const tags = patch.tags ? cleanTags(patch.tags) : undefined;
  const set: Record<string, unknown> = {};
  for (const k of [
    'displayName',
    'description',
    'credits',
    'origin',
    'brandId',
    'folderId',
  ] as const)
    if (k in patch) set[k] = (patch as Record<string, unknown>)[k] ?? null;
  if (typeof set.displayName === 'string')
    set.displayName = set.displayName.trim().slice(0, 190) || a.displayName;
  await db.transaction(async (tx) => {
    // metadados valem para todas as versões do mesmo arquivo
    if (Object.keys(set).length)
      await tx
        .update(assets)
        .set(set)
        .where(
          and(eq(assets.rootAssetId, a.rootAssetId), eq(assets.organizationId, ctx.organizationId)),
        );
    if (tags) {
      const all = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(eq(assets.rootAssetId, a.rootAssetId));
      const ids = all.map((x) => x.id);
      await tx.delete(assetTags).where(inArray(assetTags.assetId, ids));
      if (tags.length)
        await tx
          .insert(assetTags)
          .values(ids.flatMap((assetId) => tags.map((tag) => ({ assetId, tag }))));
    }
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'asset.updated',
      entityType: 'asset',
      entityId: id,
      metadata: { fields: [...Object.keys(set), ...(tags ? ['tags'] : [])] },
      ip: ctx.ip,
    });
  });
}

export async function setFavorite(db: Db, ctx: Ctx, id: string, on: boolean) {
  await loadAsset(db, ctx, id);
  if (on)
    await db
      .insert(assetFavorites)
      .values({ assetId: id, userId: ctx.userId })
      .onDuplicateKeyUpdate({ set: { assetId: id } });
  else
    await db
      .delete(assetFavorites)
      .where(and(eq(assetFavorites.assetId, id), eq(assetFavorites.userId, ctx.userId)));
}

// ------------------------------------------------------------------ lixeira
export async function trashAsset(db: Db, ctx: Ctx, id: string) {
  const a = await loadAsset(db, ctx, id, 'library:delete');
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(
        and(eq(assets.rootAssetId, a.rootAssetId), eq(assets.organizationId, ctx.organizationId)),
      );
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'asset.trashed',
      entityType: 'asset',
      entityId: id,
      metadata: { name: a.displayName },
      ip: ctx.ip,
    });
  });
}

export async function restoreAsset(db: Db, ctx: Ctx, id: string) {
  const a = await loadAsset(db, ctx, id, 'library:delete', { includeTrash: true });
  if (!a.deletedAt) throw new AppError('CONFLICT', 'O arquivo não está na lixeira.');
  await db.transaction(async (tx) => {
    await tx
      .update(assets)
      .set({ deletedAt: null })
      .where(
        and(eq(assets.rootAssetId, a.rootAssetId), eq(assets.organizationId, ctx.organizationId)),
      );
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'asset.restored',
      entityType: 'asset',
      entityId: id,
      metadata: { name: a.displayName },
      ip: ctx.ip,
    });
  });
}

async function purgeRows(
  db: Db,
  storage: StorageDriver,
  rows: { id: string; storageKey: string }[],
) {
  for (const r of rows) {
    await storage
      .delete(r.storageKey)
      .catch((e) =>
        createLogger().warn('Falha ao apagar arquivo do armazenamento', { id: r.id, err: e }),
      );
    await db.delete(assets).where(eq(assets.id, r.id));
  }
}

/** Exclusão definitiva (somente da lixeira) de um arquivo e de todas as suas versões. */
export async function purgeAsset(db: Db, storage: StorageDriver, ctx: Ctx, id: string) {
  const a = await loadAsset(db, ctx, id, 'library:delete', { includeTrash: true });
  if (!a.deletedAt)
    throw new AppError(
      'CONFLICT',
      'Envie o arquivo para a lixeira antes de excluí-lo definitivamente.',
    );
  const rows = await db
    .select({ id: assets.id, storageKey: assets.storageKey })
    .from(assets)
    .where(
      and(eq(assets.rootAssetId, a.rootAssetId), eq(assets.organizationId, ctx.organizationId)),
    );
  await purgeRows(db, storage, rows);
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'asset.purged',
    entityType: 'asset',
    entityId: id,
    metadata: { name: a.displayName, versions: rows.length },
    ip: ctx.ip,
  });
}

/** Rotina de retenção: apaga definitivamente o que está na lixeira há mais de N dias. Agendar via cron (ver docs). */
export async function purgeExpiredAssets(
  db: Db,
  storage: StorageDriver,
  days = TRASH_RETENTION_DAYS,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - days * 86_400_000);
  const rows = await db
    .select({ id: assets.id, storageKey: assets.storageKey })
    .from(assets)
    .where(and(isNotNull(assets.deletedAt), lt(assets.deletedAt, cutoff)));
  await purgeRows(db, storage, rows);
  return rows.length;
}

// ------------------------------------------------------------------- pastas
export async function listFolders(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId);
  if (ctx.userKind !== 'internal') return [];
  requireAnyScope(ctx, 'library:view');
  return db
    .select({
      id: assetFolders.id,
      name: assetFolders.name,
      parentId: assetFolders.parentId,
      brandId: assetFolders.brandId,
    })
    .from(assetFolders)
    .where(
      and(
        eq(assetFolders.organizationId, ctx.organizationId),
        eq(assetFolders.clientId, clientId),
        isNull(assetFolders.deletedAt),
      ),
    )
    .orderBy(assetFolders.name);
}

export async function createFolder(
  db: Db,
  ctx: Ctx,
  input: { clientId: string; brandId?: string | null; parentId?: string | null; name: string },
) {
  await loadClient(db, ctx, input.clientId);
  if (ctx.userKind !== 'internal' || !can(ctx, 'library:create', input.clientId)) throw forbidden();
  await validateTargets(db, ctx, input.clientId, input.brandId, input.parentId);
  if (input.parentId) {
    let depth = 1;
    let cur: string | null = input.parentId;
    while (cur && depth < 6) {
      const [p]: { parentId: string | null }[] = await db
        .select({ parentId: assetFolders.parentId })
        .from(assetFolders)
        .where(eq(assetFolders.id, cur));
      cur = p?.parentId ?? null;
      depth++;
    }
    if (depth > 5)
      throw new AppError('VALIDATION', 'Profundidade máxima de pastas atingida.', {
        parentId: ['No máximo 5 níveis.'],
      });
  }
  const dup = await db
    .select({ id: assetFolders.id })
    .from(assetFolders)
    .where(
      and(
        eq(assetFolders.organizationId, ctx.organizationId),
        eq(assetFolders.clientId, input.clientId),
        isNull(assetFolders.deletedAt),
        eq(assetFolders.name, input.name),
        input.parentId ? eq(assetFolders.parentId, input.parentId) : isNull(assetFolders.parentId),
      ),
    );
  if (dup.length) throw new AppError('CONFLICT', 'Já existe uma pasta com este nome neste local.');
  const id = newId();
  await db.insert(assetFolders).values({
    id,
    organizationId: ctx.organizationId,
    clientId: input.clientId,
    brandId: input.brandId ?? null,
    parentId: input.parentId ?? null,
    name: input.name,
  });
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'folder.created',
    entityType: 'client',
    entityId: input.clientId,
    metadata: { folderId: id, name: input.name },
    ip: ctx.ip,
  });
  return { id };
}

export async function deleteFolder(db: Db, ctx: Ctx, id: string) {
  const [f] = await db
    .select()
    .from(assetFolders)
    .where(
      and(
        eq(assetFolders.id, id),
        eq(assetFolders.organizationId, ctx.organizationId),
        isNull(assetFolders.deletedAt),
      ),
    );
  if (!f) throw nf('Pasta');
  await loadClient(db, ctx, f.clientId);
  if (ctx.userKind !== 'internal' || !can(ctx, 'library:delete', f.clientId)) throw forbidden();
  await db.transaction(async (tx) => {
    await tx.update(assets).set({ folderId: null }).where(eq(assets.folderId, id)); // arquivos voltam para a raiz do cliente
    await tx
      .update(assetFolders)
      .set({ parentId: f.parentId })
      .where(eq(assetFolders.parentId, id));
    await tx.update(assetFolders).set({ deletedAt: new Date() }).where(eq(assetFolders.id, id));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'folder.deleted',
      entityType: 'client',
      entityId: f.clientId,
      metadata: { folderId: id, name: f.name },
      ip: ctx.ip,
    });
  });
}

// ---------------------------------------------------- vínculo com conteúdos
export async function listContentAssets(db: Db, ctx: Ctx, contentId: string) {
  const c = await loadForWrite(db, ctx, contentId, 'contents:view');
  const rows = await db
    .select({ a: assets, role: contentAssets.role })
    .from(contentAssets)
    .innerJoin(assets, eq(assets.id, contentAssets.assetId))
    .where(and(eq(contentAssets.contentId, c.id), eq(assets.organizationId, ctx.organizationId)));
  return rows.map(({ a, role }) => ({
    id: a.id,
    displayName: a.displayName,
    kind: a.kind,
    mime: a.mime,
    sizeBytes: a.sizeBytes,
    versionNumber: a.versionNumber,
    role,
    trashed: a.deletedAt !== null,
  }));
}

export async function linkAsset(
  db: Db,
  ctx: Ctx,
  contentId: string,
  assetId: string,
  role: 'attachment' | 'cover' | 'reference' = 'attachment',
) {
  const c = await loadForWrite(db, ctx, contentId, 'contents:edit');
  const a = await loadAsset(db, ctx, assetId);
  if (a.clientId !== c.clientId)
    throw new AppError('VALIDATION', 'O arquivo pertence a outro cliente.', {
      assetId: ['Escolha um arquivo do mesmo cliente do conteúdo.'],
    });
  if (!a.isLatest)
    throw new AppError('VALIDATION', 'Vincule a versão mais recente do arquivo.', {
      assetId: ['Versão antiga.'],
    });
  try {
    await db.insert(contentAssets).values({ contentId, assetId, role, createdBy: ctx.userId });
  } catch (e) {
    if (isDuplicateEntry(e))
      throw new AppError('CONFLICT', 'Este arquivo já está vinculado ao conteúdo.');
    throw e;
  }
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'content.asset_linked',
    entityType: 'content',
    entityId: contentId,
    metadata: { assetId, role, name: a.displayName },
    ip: ctx.ip,
  });
}

export async function unlinkAsset(db: Db, ctx: Ctx, contentId: string, assetId: string) {
  const c = await loadForWrite(db, ctx, contentId, 'contents:edit');
  const [res] = await db
    .delete(contentAssets)
    .where(and(eq(contentAssets.contentId, c.id), eq(contentAssets.assetId, assetId)));
  if (res.affectedRows === 0) throw nf('Vínculo');
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: 'content.asset_unlinked',
    entityType: 'content',
    entityId: contentId,
    metadata: { assetId },
    ip: ctx.ip,
  });
}
