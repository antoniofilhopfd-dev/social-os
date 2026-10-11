import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteRole, updateRole } from '@/modules/roles/service';
import { roleSchema } from '@/modules/roles/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  await updateRole(getDb(), ctx, idParam(params.id), await readJson(req, roleSchema));
});

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteRole(getDb(), ctx, idParam(params.id));
});
