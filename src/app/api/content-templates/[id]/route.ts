import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { deleteTemplate } from '@/modules/editor/service';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteTemplate(getDb(), ctx, idParam(params.id));
});
