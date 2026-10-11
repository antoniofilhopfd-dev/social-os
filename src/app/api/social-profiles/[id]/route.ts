import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteProfile, updateProfile } from '@/modules/clients/children';
import { profileSchema } from '@/modules/clients/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  await updateProfile(getDb(), ctx, idParam(params.id), await readJson(req, profileSchema));
});

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteProfile(getDb(), ctx, idParam(params.id));
});
