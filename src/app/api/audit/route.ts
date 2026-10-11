import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { route } from '@/core/http';
import { listAudit } from '@/modules/audit/service';

export const GET = route(async ({ req, ctx }) => {
  const url = new URL(req.url);
  const before = url.searchParams.get('before');
  const action = url.searchParams.get('action');
  return listAudit(getDb(), ctx, {
    before: before ? idSchema.parse(before) : undefined,
    action: action ? action.slice(0, 64) : undefined,
  });
});
