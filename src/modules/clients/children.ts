import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { auditLogs, brands, clientContacts, clientDates, socialProfiles, users } from '@/db/schema';
import { audit } from '@/core/audit';
import { type Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { isDuplicateEntry } from '@/core/db';
import { newId } from '@/core/ids';
import { assertInternalMember, loadClient } from './service';

const nf = (what: string) => new AppError('NOT_FOUND', `${what} não encontrado.`);
type Json = Record<string, unknown>;

async function log(
  db: Pick<Db, 'insert'>,
  ctx: Ctx,
  clientId: string,
  action: string,
  metadata: Json,
) {
  await audit(db, {
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action,
    entityType: 'client',
    entityId: clientId,
    metadata,
    ip: ctx.ip,
  });
}

// ------------------------------------------------------------------ contatos
export async function listContacts(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId);
  return db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.organizationId, ctx.organizationId),
        eq(clientContacts.clientId, clientId),
      ),
    )
    .orderBy(desc(clientContacts.isPrimary), clientContacts.name);
}

interface ContactInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  roleTitle?: string | null;
  isPrimary?: boolean;
}

export async function createContact(db: Db, ctx: Ctx, clientId: string, input: ContactInput) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  const id = newId();
  await db.transaction(async (tx) => {
    if (input.isPrimary)
      await tx
        .update(clientContacts)
        .set({ isPrimary: 0 })
        .where(
          and(
            eq(clientContacts.clientId, clientId),
            eq(clientContacts.organizationId, ctx.organizationId),
          ),
        );
    await tx.insert(clientContacts).values({
      id,
      organizationId: ctx.organizationId,
      clientId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      roleTitle: input.roleTitle ?? null,
      isPrimary: input.isPrimary ? 1 : 0,
    });
    await log(tx, ctx, clientId, 'contact.created', { contactId: id, name: input.name });
  });
  return { id };
}

async function loadContact(db: Db, ctx: Ctx, clientId: string, contactId: string) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  const [row] = await db
    .select()
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.id, contactId),
        eq(clientContacts.clientId, clientId),
        eq(clientContacts.organizationId, ctx.organizationId),
      ),
    );
  if (!row) throw nf('Contato');
  return row;
}

export async function updateContact(
  db: Db,
  ctx: Ctx,
  clientId: string,
  contactId: string,
  input: ContactInput,
) {
  await loadContact(db, ctx, clientId, contactId);
  await db.transaction(async (tx) => {
    if (input.isPrimary)
      await tx
        .update(clientContacts)
        .set({ isPrimary: 0 })
        .where(
          and(
            eq(clientContacts.clientId, clientId),
            eq(clientContacts.organizationId, ctx.organizationId),
          ),
        );
    await tx
      .update(clientContacts)
      .set({
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        roleTitle: input.roleTitle ?? null,
        isPrimary: input.isPrimary ? 1 : 0,
      })
      .where(eq(clientContacts.id, contactId));
    await log(tx, ctx, clientId, 'contact.updated', { contactId, name: input.name });
  });
}

export async function deleteContact(db: Db, ctx: Ctx, clientId: string, contactId: string) {
  const c = await loadContact(db, ctx, clientId, contactId);
  await db.transaction(async (tx) => {
    await tx.delete(clientContacts).where(eq(clientContacts.id, contactId));
    await log(tx, ctx, clientId, 'contact.deleted', { contactId, name: c.name });
  });
}

// --------------------------------------------------------- datas importantes
export async function listDates(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId);
  return db
    .select()
    .from(clientDates)
    .where(
      and(eq(clientDates.organizationId, ctx.organizationId), eq(clientDates.clientId, clientId)),
    )
    .orderBy(clientDates.eventDate);
}

export async function createDate(
  db: Db,
  ctx: Ctx,
  clientId: string,
  input: { label: string; eventDate: string; yearly?: boolean; note?: string | null },
) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  if (Number.isNaN(Date.parse(input.eventDate)))
    throw new AppError('VALIDATION', 'Data inválida.', { eventDate: ['Data inválida.'] });
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(clientDates).values({
      id,
      organizationId: ctx.organizationId,
      clientId,
      label: input.label,
      eventDate: input.eventDate,
      yearly: input.yearly === false ? 0 : 1,
      note: input.note ?? null,
    });
    await log(tx, ctx, clientId, 'date.created', { dateId: id, label: input.label });
  });
  return { id };
}

export async function deleteDate(db: Db, ctx: Ctx, clientId: string, dateId: string) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  const [row] = await db
    .select()
    .from(clientDates)
    .where(
      and(
        eq(clientDates.id, dateId),
        eq(clientDates.clientId, clientId),
        eq(clientDates.organizationId, ctx.organizationId),
      ),
    );
  if (!row) throw nf('Data');
  await db.transaction(async (tx) => {
    await tx.delete(clientDates).where(eq(clientDates.id, dateId));
    await log(tx, ctx, clientId, 'date.deleted', { dateId, label: row.label });
  });
}

// ------------------------------------------------------------- marcas/perfis
export interface BrandInput {
  name: string;
  status?: 'active' | 'inactive';
  description?: string | null;
  objectives?: string | null;
  audience?: string | null;
  toneOfVoice?: string | null;
  editorialGuidelines?: string | null;
}

export async function listBrands(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId);
  const bs = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.organizationId, ctx.organizationId),
        eq(brands.clientId, clientId),
        isNull(brands.deletedAt),
      ),
    )
    .orderBy(brands.name);
  const ps = bs.length
    ? await db
        .select({ p: socialProfiles, ownerName: users.name })
        .from(socialProfiles)
        .leftJoin(users, eq(users.id, socialProfiles.ownerUserId))
        .where(
          and(
            eq(socialProfiles.organizationId, ctx.organizationId),
            isNull(socialProfiles.deletedAt),
          ),
        )
    : [];
  const byBrand = new Map<string, typeof ps>();
  for (const x of ps) byBrand.set(x.p.brandId, [...(byBrand.get(x.p.brandId) ?? []), x]);
  return bs.map((b) => ({
    ...b,
    deletedAt: undefined,
    profiles: (byBrand.get(b.id) ?? [])
      .map(({ p, ownerName }) => ({ ...p, deletedAt: undefined, ownerName }))
      .sort((a, b2) => a.network.localeCompare(b2.network)),
  }));
}

export async function createBrand(db: Db, ctx: Ctx, clientId: string, input: BrandInput) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  await assertBrandNameFree(db, ctx, clientId, input.name);
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(brands).values({
      id,
      organizationId: ctx.organizationId,
      clientId,
      name: input.name,
      status: input.status ?? 'active',
      description: input.description ?? null,
      objectives: input.objectives ?? null,
      audience: input.audience ?? null,
      toneOfVoice: input.toneOfVoice ?? null,
      editorialGuidelines: input.editorialGuidelines ?? null,
    });
    await log(tx, ctx, clientId, 'brand.created', { brandId: id, name: input.name });
  });
  return { id };
}

async function assertBrandNameFree(
  db: Db,
  ctx: Ctx,
  clientId: string,
  name: string,
  exceptId?: string,
) {
  const rows = await db
    .select({ id: brands.id })
    .from(brands)
    .where(
      and(
        eq(brands.organizationId, ctx.organizationId),
        eq(brands.clientId, clientId),
        isNull(brands.deletedAt),
        eq(brands.name, name),
      ),
    );
  if (rows.some((r) => r.id !== exceptId))
    throw new AppError('CONFLICT', 'Já existe uma marca com este nome neste cliente.');
}

/** Marca com checagem do cliente dono (escopo + permissão). Marca de outra org/escopo = 404. */
export async function loadBrand(db: Db, ctx: Ctx, brandId: string, perm = 'clients:view') {
  const [b] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, brandId),
        eq(brands.organizationId, ctx.organizationId),
        isNull(brands.deletedAt),
      ),
    );
  if (!b) throw nf('Marca');
  await loadClient(db, ctx, b.clientId, perm);
  return b;
}

export async function updateBrand(db: Db, ctx: Ctx, brandId: string, input: BrandInput) {
  const b = await loadBrand(db, ctx, brandId, 'clients:edit');
  await assertBrandNameFree(db, ctx, b.clientId, input.name, brandId);
  await db.transaction(async (tx) => {
    await tx
      .update(brands)
      .set({
        name: input.name,
        status: input.status ?? b.status,
        description: input.description ?? null,
        objectives: input.objectives ?? null,
        audience: input.audience ?? null,
        toneOfVoice: input.toneOfVoice ?? null,
        editorialGuidelines: input.editorialGuidelines ?? null,
      })
      .where(eq(brands.id, brandId));
    await log(tx, ctx, b.clientId, 'brand.updated', { brandId, name: input.name });
  });
}

export async function deleteBrand(db: Db, ctx: Ctx, brandId: string) {
  const b = await loadBrand(db, ctx, brandId, 'clients:delete');
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(socialProfiles)
      .set({ deletedAt: now })
      .where(and(eq(socialProfiles.brandId, brandId), isNull(socialProfiles.deletedAt)));
    await tx.update(brands).set({ deletedAt: now }).where(eq(brands.id, brandId));
    await log(tx, ctx, b.clientId, 'brand.deleted', { brandId, name: b.name });
  });
}

export interface ProfileInput {
  network: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'youtube' | 'pinterest' | 'other';
  profileName: string;
  handle: string;
  url?: string | null;
  ownerUserId?: string | null;
  status?: 'active' | 'paused' | 'inactive';
  accountType?: string | null;
  notes?: string | null;
}

const normalizeHandle = (h: string) => h.trim().replace(/^@+/, '').toLowerCase();

async function assertProfileFree(
  db: Db,
  ctx: Ctx,
  brandId: string,
  network: string,
  handle: string,
  exceptId?: string,
) {
  const rows = await db
    .select({ id: socialProfiles.id })
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.organizationId, ctx.organizationId),
        eq(socialProfiles.brandId, brandId),
        eq(socialProfiles.network, network as ProfileInput['network']),
        eq(socialProfiles.handle, handle),
        isNull(socialProfiles.deletedAt),
      ),
    );
  if (rows.some((r) => r.id !== exceptId))
    throw new AppError('CONFLICT', 'Este perfil já está cadastrado para a marca.');
}

export async function createProfile(db: Db, ctx: Ctx, brandId: string, input: ProfileInput) {
  const b = await loadBrand(db, ctx, brandId, 'clients:edit');
  const handle = normalizeHandle(input.handle);
  if (!handle)
    throw new AppError('VALIDATION', 'Informe o identificador.', {
      handle: ['Informe o identificador.'],
    });
  if (input.ownerUserId) await assertInternalMember(db, ctx.organizationId, input.ownerUserId);
  await assertProfileFree(db, ctx, brandId, input.network, handle);
  const id = newId();
  try {
    await db.transaction(async (tx) => {
      await tx.insert(socialProfiles).values({
        id,
        organizationId: ctx.organizationId,
        brandId,
        network: input.network,
        profileName: input.profileName,
        handle,
        url: input.url ?? null,
        ownerUserId: input.ownerUserId ?? null,
        status: input.status ?? 'active',
        accountType: input.accountType ?? null,
        notes: input.notes ?? null,
      });
      await log(tx, ctx, b.clientId, 'profile.created', {
        profileId: id,
        brandId,
        network: input.network,
        handle,
      });
    });
  } catch (e) {
    if (isDuplicateEntry(e))
      throw new AppError('CONFLICT', 'Este perfil já está cadastrado para a marca.');
    throw e;
  }
  return { id };
}

async function loadProfile(db: Db, ctx: Ctx, profileId: string, perm: string) {
  const [p] = await db
    .select()
    .from(socialProfiles)
    .where(
      and(
        eq(socialProfiles.id, profileId),
        eq(socialProfiles.organizationId, ctx.organizationId),
        isNull(socialProfiles.deletedAt),
      ),
    );
  if (!p) throw nf('Perfil');
  const b = await loadBrand(db, ctx, p.brandId, perm);
  return { p, b };
}

export async function updateProfile(db: Db, ctx: Ctx, profileId: string, input: ProfileInput) {
  const { p, b } = await loadProfile(db, ctx, profileId, 'clients:edit');
  const handle = normalizeHandle(input.handle);
  if (input.ownerUserId) await assertInternalMember(db, ctx.organizationId, input.ownerUserId);
  await assertProfileFree(db, ctx, p.brandId, input.network, handle, profileId);
  await db.transaction(async (tx) => {
    await tx
      .update(socialProfiles)
      .set({
        network: input.network,
        profileName: input.profileName,
        handle,
        url: input.url ?? null,
        ownerUserId: input.ownerUserId ?? null,
        status: input.status ?? p.status,
        accountType: input.accountType ?? null,
        notes: input.notes ?? null,
      })
      .where(eq(socialProfiles.id, profileId));
    await log(tx, ctx, b.clientId, 'profile.updated', {
      profileId,
      network: input.network,
      handle,
    });
  });
}

export async function deleteProfile(db: Db, ctx: Ctx, profileId: string) {
  const { p, b } = await loadProfile(db, ctx, profileId, 'clients:delete');
  await db.transaction(async (tx) => {
    await tx
      .update(socialProfiles)
      .set({ deletedAt: new Date() })
      .where(eq(socialProfiles.id, profileId));
    await log(tx, ctx, b.clientId, 'profile.deleted', {
      profileId,
      network: p.network,
      handle: p.handle,
    });
  });
}

// ----------------------------------------------------------------- histórico
export async function listClientHistory(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId, 'clients:edit'); // histórico é interno
  if (ctx.userKind !== 'internal')
    throw new AppError('FORBIDDEN', 'Você não tem permissão para esta ação.');
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
        eq(auditLogs.entityType, 'client'),
        eq(auditLogs.entityId, clientId),
      ),
    )
    .orderBy(desc(auditLogs.id))
    .limit(100);
}
