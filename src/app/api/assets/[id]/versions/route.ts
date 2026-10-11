import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { AppError } from '@/core/errors';
import { route } from '@/core/http';
import { uploadAssetVersion } from '@/modules/library/service';
import { getStorage, maxUploadBytes } from '@/modules/library/storage';

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const max = maxUploadBytes();
  if (Number(req.headers.get('content-length') ?? 0) > max + 64 * 1024)
    throw new AppError(
      'VALIDATION',
      `O arquivo excede o limite de ${Math.round(max / 1048576)} MB.`,
    );
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new AppError('VALIDATION', 'Envio inválido.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) throw new AppError('VALIDATION', 'Selecione um arquivo.');
  return uploadAssetVersion(
    getDb(),
    getStorage(),
    ctx,
    idParam(params.id),
    { name: file.name, data: Buffer.from(await file.arrayBuffer()) },
    { maxBytes: max },
  );
});
