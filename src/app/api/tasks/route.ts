import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { cleanParams } from '@/modules/requests/schema';
import { createTaskSchema, taskFiltersSchema } from '@/modules/tasks/schema';
import { createTask, listTasks } from '@/modules/tasks/service';

export const GET = route(async ({ req, ctx }) => {
  const f = taskFiltersSchema.parse(cleanParams(Object.fromEntries(new URL(req.url).searchParams)));
  return listTasks(getDb(), ctx, { ...f, overdue: f.overdue === '1', limit: 200 });
});
export const POST = route(async ({ req, ctx }) =>
  createTask(getDb(), ctx, await readJson(req, createTaskSchema)),
);
