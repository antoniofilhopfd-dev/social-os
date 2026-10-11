import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteBlock, saveBlock } from '@/modules/editor/service';
import { blockSchema } from '@/modules/editor/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) =>
  saveBlock(getDb(), ctx, idParam(params.id), await readJson(req, blockSchema)),
);
export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteBlock(getDb(), ctx, idParam(params.id));
});
