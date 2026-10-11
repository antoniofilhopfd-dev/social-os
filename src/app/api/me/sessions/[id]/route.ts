import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { revokeMySession } from '@/modules/auth/service';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await revokeMySession(getDb(), ctx, idParam(params.id));
});
