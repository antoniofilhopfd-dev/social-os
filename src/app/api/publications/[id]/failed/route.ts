import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { failedSchema } from '@/modules/publications/schema';
import { markFailed } from '@/modules/publications/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  await markFailed(getDb(), ctx, idParam(params.id), (await readJson(req, failedSchema)).reason);
});
