import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { checklistAddSchema } from '@/modules/tasks/schema';
import { addChecklistItem } from '@/modules/tasks/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  addChecklistItem(
    getDb(),
    ctx,
    idParam(params.id),
    (await readJson(req, checklistAddSchema)).text,
  ),
);
