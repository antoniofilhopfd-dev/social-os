import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { purgeAsset } from '@/modules/library/service';
import { getStorage } from '@/modules/library/storage';

export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await purgeAsset(getDb(), getStorage(), ctx, idParam(params.id));
});
