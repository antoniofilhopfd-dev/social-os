import { z } from 'zod';
import { idSchema } from '@/core/api-schemas';
import { isValidDate } from '@/modules/contents/rules';
import { MAX_METRIC_VALUE, METRIC_FIELDS } from './rules';

const dateStr = z.string().refine(isValidDate, 'Data inválida.');
const metric = z
  .number({ error: 'Informe um número.' })
  .int('Use um número inteiro.')
  .min(0, 'Não pode ser negativo.')
  .max(MAX_METRIC_VALUE, 'Valor muito alto.')
  .nullable()
  .optional();

export const metricEntrySchema = z.object({
  capturedOn: dateStr,
  ...(Object.fromEntries(METRIC_FIELDS.map((f) => [f, metric])) as Record<
    (typeof METRIC_FIELDS)[number],
    typeof metric
  >),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export const metricPatchSchema = metricEntrySchema.partial().strict();

export const snapshotSchema = z.object({
  socialProfileId: idSchema,
  capturedOn: dateStr,
  followers: z
    .number({ error: 'Informe um número.' })
    .int('Use um número inteiro.')
    .min(0, 'Não pode ser negativo.')
    .max(MAX_METRIC_VALUE, 'Valor muito alto.'),
});

export const reportFiltersSchema = z.object({
  from: dateStr,
  to: dateStr,
  clientId: idSchema.optional(),
  profileId: idSchema.optional(),
});
