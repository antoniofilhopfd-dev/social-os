import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { getApproval } from '@/modules/approvals/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getApproval(getDb(), ctx, idParam(params.id)),
);
