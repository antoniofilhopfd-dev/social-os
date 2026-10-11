import { z } from 'zod';
import { getDb } from '@/db';
import { idSchema } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createFolder, listFolders } from '@/modules/library/service';

export const GET = route(async ({ req, ctx }) => {
  const clientId = idSchema.parse(new URL(req.url).searchParams.get('clientId'));
  return { items: await listFolders(getDb(), ctx, clientId) };
});
export const POST = route(async ({ req, ctx }) =>
  createFolder(
    getDb(),
    ctx,
    await readJson(
      req,
      z.object({
        clientId: idSchema,
        brandId: idSchema.nullable().optional(),
        parentId: idSchema.nullable().optional(),
        name: z.string().trim().min(1, 'Informe o nome.').max(120),
      }),
    ),
  ),
);
