import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { assignRequest } from '@/modules/requests/service';
import { assignSchema } from '@/modules/requests/schema';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { assigneeUserId, estimatedDue } = await readJson(req, assignSchema);
  await assignRequest(getDb(), ctx, idParam(params.id), assigneeUserId, estimatedDue);
});
