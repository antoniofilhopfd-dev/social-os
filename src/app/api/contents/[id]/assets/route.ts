import { z } from 'zod';
import { getDb } from '@/db';
import { idParam, idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { linkAsset, listContentAssets, unlinkAsset } from '@/modules/library/service';

const linkSchema = z.object({
  assetId: idSchema,
  role: z.enum(['attachment', 'cover', 'reference']).optional(),
});

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  items: await listContentAssets(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await readJson(req, linkSchema);
  return linkAsset(getDb(), ctx, idParam(params.id), input.assetId, input.role);
});

export const DELETE = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await readJson(req, z.object({ assetId: idSchema }));
  await unlinkAsset(getDb(), ctx, idParam(params.id), input.assetId);
});
