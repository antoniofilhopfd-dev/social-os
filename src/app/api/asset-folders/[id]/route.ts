import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { deleteFolder } from '@/modules/library/service';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteFolder(getDb(), ctx, idParam(params.id));
});
