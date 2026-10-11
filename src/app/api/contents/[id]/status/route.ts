import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { changeContentStatus } from '@/modules/contents/service';
import { contentStatusSchema } from '@/modules/contents/schema';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const { to, message } = await readJson(req, contentStatusSchema);
  await changeContentStatus(getDb(), ctx, idParam(params.id), to, message);
});
