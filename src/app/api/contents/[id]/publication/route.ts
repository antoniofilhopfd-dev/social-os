import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { scheduleSchema } from '@/modules/publications/schema';
import { schedulePublication } from '@/modules/publications/service';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const i = await readJson(req, scheduleSchema);
  return schedulePublication(getDb(), ctx, idParam(params.id), {
    date: i.date,
    time: i.time,
    waiveApproval: i.waiveApproval,
    notes: i.notes,
  });
});
