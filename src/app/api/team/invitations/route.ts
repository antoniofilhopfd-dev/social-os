import { z } from 'zod';
import { getDb } from '@/db';
import { email, idSchema, personName } from '@/core/api-schemas';
import { getEnv } from '@/core/env';
import { readJson, route } from '@/core/http';
import { createInvitation } from '@/modules/team/service';

const body = z.object({ email, name: personName, roleId: idSchema, clientId: idSchema.nullish() });

export const POST = route(async ({ req, ctx }) => {
  const input = await readJson(req, body);
  const inv = await createInvitation(getDb(), ctx, input);
  return { id: inv.id, expiresAt: inv.expiresAt, link: `${getEnv().APP_URL}/convite/${inv.token}` };
});
