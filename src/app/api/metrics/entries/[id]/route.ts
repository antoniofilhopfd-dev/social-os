import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { metricPatchSchema } from '@/modules/metrics/schema';
import { deleteMetricEntry, updateMetricEntry } from '@/modules/metrics/service';

export const PATCH = route<{ id: string }>(async ({ req, ctx, params }) =>
  updateMetricEntry(getDb(), ctx, idParam(params.id), await readJson(req, metricPatchSchema)),
);
export const DELETE = route<{ id: string }>(async ({ ctx, params }) => {
  await deleteMetricEntry(getDb(), ctx, idParam(params.id));
});
