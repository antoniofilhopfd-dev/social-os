import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { listVersions, saveVersion } from '@/modules/editor/service';
import { saveVersionSchema } from '@/modules/editor/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  items: await listVersions(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const input = await readJson(req, saveVersionSchema);
  return saveVersion(getDb(), ctx, idParam(params.id), input.note, {
    aiAssisted: input.aiAssisted,
  });
});
