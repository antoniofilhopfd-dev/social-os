import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { route } from '@/core/http';
import { listNotifications } from '@/modules/notifications/service';

export const GET = route(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const before = url.searchParams.get('before');
  return listNotifications(getDb(), ctx, {
    unreadOnly: url.searchParams.get('unread') === '1',
    before: before ? idSchema.parse(before) : undefined,
  });
});
