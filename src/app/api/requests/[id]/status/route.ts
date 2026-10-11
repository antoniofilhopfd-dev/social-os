import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { changeStatus } from '@/modules/requests/service';
import { statusSchema } from '@/modules/requests/schema';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { to, message } = await readJson(req, statusSchema);
  await changeStatus(getDb(), ctx, idParam(params.id), to, message);
});
