import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { addComment } from '@/modules/requests/service';
import { commentSchema } from '@/modules/requests/schema';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { body, internalOnly } = await readJson(req, commentSchema);
  return addComment(getDb(), ctx, idParam(params.id), body, internalOnly ?? false);
});
