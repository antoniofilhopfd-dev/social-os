import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { savePillar } from '@/modules/contents/service';
import { pillarSchema } from '@/modules/contents/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) =>
  savePillar(getDb(), ctx, idParam(params.id), await readJson(req, pillarSchema)),
);
