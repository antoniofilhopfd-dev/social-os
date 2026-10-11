import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteClient, getClient, renameClient } from '@/modules/clients/service';
import { clientSchema } from '@/modules/clients/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getClient(getDb(), ctx, idParam(params.id)),
);

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  renameClient(getDb(), ctx, idParam(params.id), await readJson(req, clientSchema)),
);

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteClient(getDb(), ctx, idParam(params.id));
});
