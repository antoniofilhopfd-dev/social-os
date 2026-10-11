import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteBrand, updateBrand } from '@/modules/clients/children';
import { brandSchema } from '@/modules/clients/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  await updateBrand(getDb(), ctx, idParam(params.id), await readJson(req, brandSchema));
});

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteBrand(getDb(), ctx, idParam(params.id));
});
