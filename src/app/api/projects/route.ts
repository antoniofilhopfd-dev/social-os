import { z } from 'zod';
import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { cleanParams } from '@/modules/requests/schema';
import { PROJECT_STATUS_LABELS } from '@/modules/tasks/rules';
import { createProjectSchema } from '@/modules/tasks/schema';
import { createProject, listProjects } from '@/modules/tasks/service';

const filters = z.object({
  clientId: idSchema.optional(),
  status: z.enum(Object.keys(PROJECT_STATUS_LABELS) as [string, ...string[]]).optional(),
  q: z.string().trim().max(120).optional(),
});

export const GET = route(async ({ req, ctx }) => ({
  items: await listProjects(
    getDb(),
    ctx,
    filters.parse(cleanParams(Object.fromEntries(new URL(req.url).searchParams))),
  ),
}));
export const POST = route(async ({ req, ctx }) =>
  createProject(getDb(), ctx, await readJson(req, createProjectSchema)),
);
