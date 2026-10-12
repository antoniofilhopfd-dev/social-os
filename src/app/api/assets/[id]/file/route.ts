import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { fileResponse } from '@/modules/library/http';
import { readAssetFile } from '@/modules/library/service';
import { getStorage } from '@/modules/library/storage';

export const GET = route<{ id: string }>(async ({ req, ctx, params }) =>
  fileResponse(req, await readAssetFile(getDb(), getStorage(), ctx, idParam(params.id))),
);
