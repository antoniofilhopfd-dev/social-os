import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { listPillars, savePillar } from '@/modules/contents/service';
import { pillarSchema } from '@/modules/contents/schema';

export const GET = route(async ({ req, ctx }) => ({
  pillars: await listPillars(getDb(), ctx, {
    includeInactive: new URL(req.url).searchParams.get('all') === '1',
  }),
}));

export const POST = route(async ({ req, ctx }) =>
  savePillar(getDb(), ctx, null, await readJson(req, pillarSchema)),
);
