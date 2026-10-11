import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { getRequest, updateRequest } from '@/modules/requests/service';
import { updateRequestSchema } from '@/modules/requests/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getRequest(getDb(), ctx, idParam(params.id)),
);

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => {
  await updateRequest(getDb(), ctx, idParam(params.id), await readJson(req, updateRequestSchema));
});
