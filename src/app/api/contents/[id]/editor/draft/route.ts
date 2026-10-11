import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { saveDraft } from '@/modules/editor/service';
import { saveDraftSchema } from '@/modules/editor/schema';

export const PUT = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await readJson(req, saveDraftSchema);
  return saveDraft(getDb(), ctx, idParam(params.id), input.baseRevision, input.body);
});
