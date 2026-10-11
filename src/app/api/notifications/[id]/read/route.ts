import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { markRead } from '@/modules/notifications/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  await markRead(getDb(), ctx, idParam(params.id));
});
