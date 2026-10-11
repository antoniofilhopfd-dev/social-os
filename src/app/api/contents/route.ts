import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { cleanParams } from '@/modules/requests/schema';
import { createContent, listContents } from '@/modules/contents/service';
import { monthRange, weekDays } from '@/modules/contents/rules';
import { contentFiltersSchema, createContentSchema } from '@/modules/contents/schema';

export const GET = route(async ({ req, ctx }) => {
  const f = contentFiltersSchema.parse(
    cleanParams(Object.fromEntries(new URL(req.url).searchParams)),
  );
  let from: string | undefined;
  let to: string | undefined;
  if (f.view === 'calendario' && f.mes) ({ from, to } = monthRange(f.mes));
  if (f.view === 'semana' && f.dia) {
    const days = weekDays(f.dia);
    from = days[0];
    to = days[6];
  }
  return listContents(getDb(), ctx, {
    ...f,
    overdue: f.overdue === '1',
    includeArchived: f.archived === '1',
    from,
    to,
  });
});

export const POST = route(async ({ req, ctx }) =>
  createContent(getDb(), ctx, await readJson(req, createContentSchema)),
);
