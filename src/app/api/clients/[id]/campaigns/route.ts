import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createCampaign, listCampaigns } from '@/modules/contents/campaigns';
import { campaignSchema } from '@/modules/contents/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  campaigns: await listCampaigns(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  createCampaign(getDb(), ctx, idParam(params.id), await readJson(req, campaignSchema)),
);
