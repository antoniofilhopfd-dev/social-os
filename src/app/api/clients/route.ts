import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { createClient, listClients } from '@/modules/clients/service';
import { clientSchema } from '@/modules/clients/schema';

export const GET = route(async ({ ctx }) => ({ clients: await listClients(getDb(), ctx) }));

export const POST = route(async ({ req, ctx }) =>
  createClient(getDb(), ctx, await readJson(req, clientSchema)),
);
