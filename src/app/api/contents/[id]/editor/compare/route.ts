import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { compareVersions } from '@/modules/editor/service';
import { compareSchema } from '@/modules/editor/schema';

export const GET = route<{ id: string }>(async ({ req, ctx, params }) => {
  const q = compareSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return compareVersions(getDb(), ctx, idParam(params.id), q.a, q.b);
});
