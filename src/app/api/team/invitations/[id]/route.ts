import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { revokeInvitation } from '@/modules/team/service';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await revokeInvitation(getDb(), ctx, idParam(params.id));
});
