import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { cancelApproval } from '@/modules/approvals/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  await cancelApproval(getDb(), ctx, idParam(params.id));
});
