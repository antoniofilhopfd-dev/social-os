import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { publishedSchema } from '@/modules/publications/schema';
import { markPublished } from '@/modules/publications/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  await markPublished(getDb(), ctx, idParam(params.id), await readJson(req, publishedSchema));
});
