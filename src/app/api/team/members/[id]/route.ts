import { z } from 'zod';
import { getDb } from '@/db';
import { idParam, idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { changeMemberRole, removeMember } from '@/modules/team/service';

const body = z.object({ roleId: idSchema });

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { roleId } = await readJson(req, body);
  await changeMemberRole(getDb(), ctx, idParam(params.id), roleId);
});

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await removeMember(getDb(), ctx, idParam(params.id));
});
