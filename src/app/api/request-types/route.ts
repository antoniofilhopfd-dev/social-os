import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { listRequestTypes, saveRequestType } from '@/modules/requests/service';
import { requestTypeSchema } from '@/modules/requests/schema';

export const GET = route(async ({ req, ctx }) => ({
  types: await listRequestTypes(getDb(), ctx, {
    includeInactive: new URL(req.url).searchParams.get('all') === '1',
  }),
}));

export const POST = route(async ({ req, ctx }) =>
  saveRequestType(getDb(), ctx, null, await readJson(req, requestTypeSchema)),
);
