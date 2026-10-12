import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { metricEntrySchema } from '@/modules/metrics/schema';
import { listPublicationMetrics, recordMetrics } from '@/modules/metrics/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  items: await listPublicationMetrics(getDb(), ctx, idParam(params.id)),
}));
export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  recordMetrics(getDb(), ctx, idParam(params.id), await readJson(req, metricEntrySchema)),
);
