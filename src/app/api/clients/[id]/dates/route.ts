import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createDate, listDates } from '@/modules/clients/children';
import { dateSchema } from '@/modules/clients/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  dates: await listDates(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  createDate(getDb(), ctx, idParam(params.id), await readJson(req, dateSchema)),
);
