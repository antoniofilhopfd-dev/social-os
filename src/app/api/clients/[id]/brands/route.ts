import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createBrand, listBrands } from '@/modules/clients/children';
import { brandSchema } from '@/modules/clients/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  brands: await listBrands(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  createBrand(getDb(), ctx, idParam(params.id), await readJson(req, brandSchema)),
);
