import { getDb } from '@/db';
import { route } from '@/core/http';
import { searchAll } from '@/modules/search/service';

export const GET = route(async ({ req, ctx }) => {
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return searchAll(getDb(), ctx, q);
});
