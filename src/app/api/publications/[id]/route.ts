import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { rescheduleSchema } from '@/modules/publications/schema';
import { getPublication, reschedulePublication } from '@/modules/publications/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getPublication(getDb(), ctx, idParam(params.id)),
);
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  reschedulePublication(getDb(), ctx, idParam(params.id), await readJson(req, rescheduleSchema)),
);
