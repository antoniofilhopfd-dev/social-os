import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { updateTaskSchema } from '@/modules/tasks/schema';
import { deleteTask, getTask, updateTask } from '@/modules/tasks/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getTask(getDb(), ctx, idParam(params.id)),
);
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateTask(getDb(), ctx, idParam(params.id), await readJson(req, updateTaskSchema)),
);
export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteTask(getDb(), ctx, idParam(params.id));
});
