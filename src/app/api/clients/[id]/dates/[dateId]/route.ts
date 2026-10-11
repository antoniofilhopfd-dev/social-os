import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { deleteDate } from '@/modules/clients/children';

export const DELETE = route<{ id: string; dateId: string }>(async ({ ctx, params }) => {
  await deleteDate(getDb(), ctx, idParam(params.id), idParam(params.dateId));
});
