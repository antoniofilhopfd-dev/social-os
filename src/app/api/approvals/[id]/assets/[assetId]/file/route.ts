import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { readApprovalAsset } from '@/modules/approvals/service';
import { fileResponse } from '@/modules/library/http';
import { getStorage } from '@/modules/library/storage';

export const GET = route<{ id: string; assetId: string }>(async ({ req, ctx, params }) =>
  fileResponse(
    req,
    await readApprovalAsset(
      getDb(),
      getStorage(),
      ctx,
      idParam(params.id),
      idParam(params.assetId),
    ),
  ),
);
