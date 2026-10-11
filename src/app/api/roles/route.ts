import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { createRole, listRoles } from '@/modules/roles/service';
import { roleSchema } from '@/modules/roles/schema';

export const GET = route(async ({ ctx }) => ({ roles: await listRoles(getDb(), ctx) }));

export const POST = route(async ({ req, ctx }) =>
  createRole(getDb(), ctx, await readJson(req, roleSchema)),
);
