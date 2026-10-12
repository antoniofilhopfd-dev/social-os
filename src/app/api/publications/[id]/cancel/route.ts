import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { cancelPublication } from '@/modules/publications/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  await cancelPublication(getDb(), ctx, idParam(params.id));
});
