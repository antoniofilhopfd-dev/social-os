import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteContent, getContent, updateContent } from '@/modules/contents/service';
import { updateContentSchema } from '@/modules/contents/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getContent(getDb(), ctx, idParam(params.id)),
);

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateContent(getDb(), ctx, idParam(params.id), await readJson(req, updateContentSchema)),
);

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteContent(getDb(), ctx, idParam(params.id));
});
