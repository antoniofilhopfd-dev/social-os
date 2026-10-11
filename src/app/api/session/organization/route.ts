import { z } from 'zod';
import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { switchOrganization } from '@/modules/organizations/service';

const body = z.object({ organizationId: idSchema });

export const POST = route(async ({ req, ctx }) => {
  const { organizationId } = await readJson(req, body);
  await switchOrganization(getDb(), ctx, organizationId);
});
