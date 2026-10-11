import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { createTemplate, listTemplates } from '@/modules/editor/service';
import { templateSchema } from '@/modules/editor/schema';

export const GET = route(async ({ req, ctx }) => ({
  items: await listTemplates(
    getDb(),
    ctx,
    new URL(req.url).searchParams.get('format') || undefined,
  ),
}));
export const POST = route(async ({ req, ctx }) =>
  createTemplate(getDb(), ctx, await readJson(req, templateSchema)),
);
