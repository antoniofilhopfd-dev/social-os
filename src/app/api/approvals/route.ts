import { getDb } from '@/db';
import { route } from '@/core/http';
import { approvalFiltersSchema } from '@/modules/approvals/schema';
import { listApprovals } from '@/modules/approvals/service';
import { cleanParams } from '@/modules/requests/schema';

export const GET = route(async ({ req, ctx }) =>
  listApprovals(
    getDb(),
    ctx,
    approvalFiltersSchema.parse(cleanParams(Object.fromEntries(new URL(req.url).searchParams))),
  ),
);
