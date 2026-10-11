import { z } from 'zod';
import { getDb } from '@/db';
import { idParam, idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { getAsset, trashAsset, updateAsset } from '@/modules/library/service';

const patchSchema = z.object({
  displayName: z.string().trim().min(1).max(190).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  credits: z.string().trim().max(190).nullable().optional(),
  origin: z.string().trim().max(190).nullable().optional(),
  brandId: idSchema.nullable().optional(),
  folderId: idSchema.nullable().optional(),
  tags: z.array(z.string().max(40)).max(30).optional(),
});

export const GET = route<{ id: string }>(async ({ req, ctx, params }) =>
  getAsset(getDb(), ctx, idParam(params.id), {
    includeTrash: new URL(req.url).searchParams.get('trash') === '1',
  }),
);
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateAsset(getDb(), ctx, idParam(params.id), await readJson(req, patchSchema)),
);
export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await trashAsset(getDb(), ctx, idParam(params.id));
});
