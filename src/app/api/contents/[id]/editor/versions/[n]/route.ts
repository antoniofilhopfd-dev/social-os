import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { AppError } from '@/core/errors';
import { route } from '@/core/http';
import { getVersion } from '@/modules/editor/service';

export const GET = route<{ id: string; n: string }>(async ({ ctx, params }) => {
  const n = Number(params.n);
  if (!Number.isInteger(n) || n < 1) throw new AppError('NOT_FOUND', 'Versão não encontrada.');
  return getVersion(getDb(), ctx, idParam(params.id), n);
});
