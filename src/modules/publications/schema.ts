import { z } from 'zod';
import { idSchema } from '@/core/api-schemas';
import { isValidDate } from '@/modules/contents/rules';

const dateStr = z.string().refine(isValidDate, 'Data inválida.');
const timeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const scheduleSchema = z.object({
  date: dateStr,
  time: timeStr,
  waiveApproval: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const rescheduleSchema = z.object({ date: dateStr, time: timeStr });
export const publishedSchema = z.object({
  publishedAt: z.string().datetime({ offset: true }).optional(),
  postUrl: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export const failedSchema = z.object({
  reason: z.string({ error: 'Informe o motivo.' }).trim().min(3, 'Informe o motivo.').max(1000),
});
export const publicationFiltersSchema = z.object({
  clientId: idSchema.optional(),
  contentId: idSchema.optional(),
  status: z.enum(['scheduled', 'published', 'failed', 'cancelled']).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  before: idSchema.optional(),
});
