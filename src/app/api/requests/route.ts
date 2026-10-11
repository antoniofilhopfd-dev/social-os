import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { createRequest, listRequests } from '@/modules/requests/service';
import { cleanParams, createRequestSchema, listFiltersSchema } from '@/modules/requests/schema';

export const GET = route(async ({ req, ctx }) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = listFiltersSchema.parse(cleanParams(sp));
  return listRequests(getDb(), ctx, { ...f, overdue: f.overdue === '1' });
});

export const POST = route(async ({ req, ctx }) =>
  createRequest(getDb(), ctx, await readJson(req, createRequestSchema)),
);
