import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { deleteSnapshot } from '@/modules/metrics/service';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteSnapshot(getDb(), ctx, idParam(params.id));
});
