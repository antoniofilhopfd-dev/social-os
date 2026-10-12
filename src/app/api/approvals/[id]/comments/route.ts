import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { approvalCommentSchema } from '@/modules/approvals/schema';
import { addApprovalComment } from '@/modules/approvals/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  addApprovalComment(
    getDb(),
    ctx,
    idParam(params.id),
    (await readJson(req, approvalCommentSchema)).body,
  ),
);
