import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { updateProjectSchema } from '@/modules/tasks/schema';
import { deleteProject, getProject, updateProject } from '@/modules/tasks/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getProject(getDb(), ctx, idParam(params.id)),
);
export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateProject(getDb(), ctx, idParam(params.id), await readJson(req, updateProjectSchema)),
);
export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteProject(getDb(), ctx, idParam(params.id));
});
