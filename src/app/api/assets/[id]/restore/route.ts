import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { restoreAsset } from '@/modules/library/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  await restoreAsset(getDb(), ctx, idParam(params.id));
});
