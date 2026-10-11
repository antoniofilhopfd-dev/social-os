import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteClient, getClient, updateClient } from '@/modules/clients/service';
import { clientUpdateSchema } from '@/modules/clients/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getClient(getDb(), ctx, idParam(params.id)),
);

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateClient(getDb(), ctx, idParam(params.id), await readJson(req, clientUpdateSchema)),
);

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteClient(getDb(), ctx, idParam(params.id));
});
