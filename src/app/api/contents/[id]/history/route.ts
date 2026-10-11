import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { listContentHistory } from '@/modules/contents/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  history: await listContentHistory(getDb(), ctx, idParam(params.id)),
}));
