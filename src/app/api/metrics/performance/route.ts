import { getDb } from '@/db';
import { route } from '@/core/http';
import { reportFiltersSchema } from '@/modules/metrics/schema';
import { performanceReport } from '@/modules/metrics/service';

export const GET = route(async ({ req, ctx }) =>
  performanceReport(
    getDb(),
    ctx,
    reportFiltersSchema.parse(Object.fromEntries(new URL(req.url).searchParams)),
  ),
);
