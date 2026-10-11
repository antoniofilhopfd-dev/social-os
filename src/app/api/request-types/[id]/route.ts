import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { saveRequestType } from '@/modules/requests/service';
import { requestTypeSchema } from '@/modules/requests/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) =>
  saveRequestType(getDb(), ctx, idParam(params.id), await readJson(req, requestTypeSchema)),
);
