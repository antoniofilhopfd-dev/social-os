import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { taskStatusSchema } from '@/modules/tasks/schema';
import { setTaskStatus } from '@/modules/tasks/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const i = await readJson(req, taskStatusSchema);
  return setTaskStatus(getDb(), ctx, idParam(params.id), i.to, i.reason);
});
