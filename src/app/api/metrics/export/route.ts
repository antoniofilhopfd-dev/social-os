import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { route } from '@/core/http';
import { reportFiltersSchema } from '@/modules/metrics/schema';
import { exportPerformanceCsv } from '@/modules/metrics/service';

export const GET = route(async ({ req, ctx }) => {
  const f = reportFiltersSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const csv = await exportPerformanceCsv(getDb(), ctx, f);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="resultados-${f.from}-a-${f.to}.csv"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
