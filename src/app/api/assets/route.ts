import { z } from 'zod';
import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { AppError } from '@/core/errors';
import { route } from '@/core/http';
import { cleanParams } from '@/modules/requests/schema';
import { listAssets, storageUsage, uploadAsset } from '@/modules/library/service';
import { getStorage, maxUploadBytes } from '@/modules/library/storage';

const filtersSchema = z.object({
  clientId: idSchema.optional(),
  brandId: idSchema.optional(),
  folderId: z.union([idSchema, z.literal('root')]).optional(),
  kind: z.string().max(20).optional(),
  q: z.string().max(120).optional(),
  tag: z.string().max(40).optional(),
  favorites: z.literal('1').optional(),
  unlinked: z.literal('1').optional(),
  trash: z.literal('1').optional(),
  before: idSchema.optional(),
});

export const GET = route(async ({ req, ctx }) => {
  const f = filtersSchema.parse(cleanParams(Object.fromEntries(new URL(req.url).searchParams)));
  const [list, usage] = await Promise.all([
    listAssets(getDb(), ctx, {
      ...f,
      favorites: f.favorites === '1',
      unlinked: f.unlinked === '1',
      trash: f.trash === '1',
    }),
    storageUsage(getDb(), ctx),
  ]);
  return { ...list, usage };
});

const metaSchema = z.object({
  clientId: idSchema,
  brandId: idSchema.optional(),
  folderId: idSchema.optional(),
  displayName: z.string().trim().max(190).optional(),
  description: z.string().trim().max(2000).optional(),
  credits: z.string().trim().max(190).optional(),
  origin: z.string().trim().max(190).optional(),
  tags: z.string().max(600).optional(),
});

/** Upload multipart (1 arquivo por requisição). O limite é checado antes de ler o corpo. */
export const POST = route(async ({ req, ctx }) => {
  const max = maxUploadBytes();
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > max + 64 * 1024)
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
  if (!(file instanceof File))
    throw new AppError('VALIDATION', 'Selecione um arquivo.', { file: ['Selecione um arquivo.'] });
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string' && v !== '') raw[k] = v;
  const m = metaSchema.parse(raw);
  const data = Buffer.from(await file.arrayBuffer());
  return uploadAsset(
    getDb(),
    getStorage(),
    ctx,
    {
      clientId: m.clientId,
      brandId: m.brandId ?? null,
      folderId: m.folderId ?? null,
      file: { name: file.name, data },
      displayName: m.displayName ?? null,
      description: m.description ?? null,
      credits: m.credits ?? null,
      origin: m.origin ?? null,
      tags: m.tags
        ? m.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
    },
    { maxBytes: max },
  );
});
