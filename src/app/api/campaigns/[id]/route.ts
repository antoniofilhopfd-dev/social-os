import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteCampaign, updateCampaign } from '@/modules/contents/campaigns';
import { campaignSchema } from '@/modules/contents/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  await updateCampaign(getDb(), ctx, idParam(params.id), await readJson(req, campaignSchema));
});

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteCampaign(getDb(), ctx, idParam(params.id));
});
