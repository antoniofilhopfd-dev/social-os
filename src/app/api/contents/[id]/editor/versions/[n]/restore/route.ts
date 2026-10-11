import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { AppError } from '@/core/errors';
import { readJson, route } from '@/core/http';
import { restoreVersion } from '@/modules/editor/service';
import { restoreSchema } from '@/modules/editor/schema';

export const POST = route<{ id: string; n: string }>(async ({ req, ctx, params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) throw new AppError('NOT_FOUND', 'Versão não encontrada.');
  const input = await readJson(req, restoreSchema);
  return restoreVersion(getDb(), ctx, idParam(params.id), n, input.baseRevision);
});
