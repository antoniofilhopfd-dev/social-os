import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db';
import { campaigns } from '@/db/schema';
import { audit } from '@/core/audit';
import type { Ctx } from '@/core/auth/context';
import { AppError } from '@/core/errors';
import { newId } from '@/core/ids';
import { loadClient } from '@/modules/clients/service';

interface CampaignInput {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: 'active' | 'inactive';
}

export async function listCampaigns(db: Db, ctx: Ctx, clientId: string) {
  await loadClient(db, ctx, clientId);
  const rows = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.organizationId, ctx.organizationId),
        eq(campaigns.clientId, clientId),
        isNull(campaigns.deletedAt),
      ),
    )
    .orderBy(desc(campaigns.createdAt));
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
  }));
}

export async function createCampaign(db: Db, ctx: Ctx, clientId: string, input: CampaignInput) {
  await loadClient(db, ctx, clientId, 'clients:edit');
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id,
      organizationId: ctx.organizationId,
      clientId,
      name: input.name,
      description: input.description ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? 'active',
    });
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'campaign.created',
      entityType: 'client',
      entityId: clientId,
      metadata: { campaignId: id, name: input.name },
      ip: ctx.ip,
    });
  });
  return { id };
}

async function loadCampaign(db: Db, ctx: Ctx, id: string, perm: string) {
  const [c] = await db
    .select()
    .from(campaigns)
    .where(
      and(
        eq(campaigns.id, id),
        eq(campaigns.organizationId, ctx.organizationId),
        isNull(campaigns.deletedAt),
      ),
    );
  if (!c) throw new AppError('NOT_FOUND', 'Campanha não encontrada.');
  await loadClient(db, ctx, c.clientId, perm);
  return c;
}

export async function updateCampaign(db: Db, ctx: Ctx, id: string, input: CampaignInput) {
  const c = await loadCampaign(db, ctx, id, 'clients:edit');
  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({
        name: input.name,
        description: input.description ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        status: input.status ?? c.status,
      })
      .where(eq(campaigns.id, id));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'campaign.updated',
      entityType: 'client',
      entityId: c.clientId,
      metadata: { campaignId: id, name: input.name },
      ip: ctx.ip,
    });
  });
}

export async function deleteCampaign(db: Db, ctx: Ctx, id: string) {
  const c = await loadCampaign(db, ctx, id, 'clients:delete');
  await db.transaction(async (tx) => {
    await tx.update(campaigns).set({ deletedAt: new Date() }).where(eq(campaigns.id, id));
    await audit(tx, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'campaign.deleted',
      entityType: 'client',
      entityId: c.clientId,
      metadata: { campaignId: id, name: c.name },
      ip: ctx.ip,
    });
  });
}
