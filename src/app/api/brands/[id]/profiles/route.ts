import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createProfile } from '@/modules/clients/children';
import { profileSchema } from '@/modules/clients/schema';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  createProfile(getDb(), ctx, idParam(params.id), await readJson(req, profileSchema)),
);
