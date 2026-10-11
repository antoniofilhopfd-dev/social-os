import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { checklistPatchSchema } from '@/modules/tasks/schema';
import { deleteChecklistItem, updateChecklistItem } from '@/modules/tasks/service';

export const PATCH = route<{ id: string; itemId: string }>(async ({ req, ctx, params }) => {
  await updateChecklistItem(
    getDb(),
    ctx,
    idParam(params.id),
    idParam(params.itemId),
    await readJson(req, checklistPatchSchema),
  );
});
export const DELETE = route<{ id: string; itemId: string }>(async ({ ctx, params }) => {
  await deleteChecklistItem(getDb(), ctx, idParam(params.id), idParam(params.itemId));
});
