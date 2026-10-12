import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { decideSchema } from '@/modules/approvals/schema';
import { decide } from '@/modules/approvals/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const i = await readJson(req, decideSchema);
  await decide(getDb(), ctx, idParam(params.id), i.decision, i.comment);
});
