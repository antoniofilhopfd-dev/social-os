import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { snapshotSchema } from '@/modules/metrics/schema';
import { listSnapshots, recordFollowers } from '@/modules/metrics/service';

export const GET = route(async ({ req, ctx }) => ({
  items: await listSnapshots(
    getDb(),
    ctx,
    idSchema.parse(new URL(req.url).searchParams.get('profileId')),
  ),
}));
export const POST = route(async ({ req, ctx }) =>
  recordFollowers(getDb(), ctx, await readJson(req, snapshotSchema)),
);
