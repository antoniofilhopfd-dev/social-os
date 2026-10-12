import { getDb } from '@/db';
import { route } from '@/core/http';
import { publicationFiltersSchema } from '@/modules/publications/schema';
import { listPublications } from '@/modules/publications/service';
import { cleanParams } from '@/modules/requests/schema';

export const GET = route(async ({ req, ctx }) =>
  listPublications(
    getDb(),
    ctx,
    publicationFiltersSchema.parse(cleanParams(Object.fromEntries(new URL(req.url).searchParams))),
  ),
);
