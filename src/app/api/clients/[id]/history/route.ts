import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { listClientHistory } from '@/modules/clients/children';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  history: await listClientHistory(getDb(), ctx, idParam(params.id)),
}));
