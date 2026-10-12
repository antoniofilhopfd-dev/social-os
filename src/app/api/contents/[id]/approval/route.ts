import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { submitSchema } from '@/modules/approvals/schema';
import { listContentApprovals, submitForApproval } from '@/modules/approvals/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  items: await listContentApprovals(getDb(), ctx, idParam(params.id)),
}));
export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  submitForApproval(getDb(), ctx, idParam(params.id), (await readJson(req, submitSchema)).message),
);
