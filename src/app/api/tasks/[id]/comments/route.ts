import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { commentSchema } from '@/modules/tasks/schema';
import { addComment } from '@/modules/tasks/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  addComment(getDb(), ctx, idParam(params.id), (await readJson(req, commentSchema)).body),
);
