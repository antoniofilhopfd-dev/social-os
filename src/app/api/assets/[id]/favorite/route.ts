import { z } from 'zod';
import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { setFavorite } from '@/modules/library/service';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { on } = await readJson(req, z.object({ on: z.boolean() }));
  await setFavorite(getDb(), ctx, idParam(params.id), on);
});
