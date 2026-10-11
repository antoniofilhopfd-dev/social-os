import { z } from 'zod';
import { CONTENT_FORMATS, CONTENT_STATUSES, PRIORITIES } from '@/db/schema';
import { idSchema } from '@/core/api-schemas';
import { isValidDate, isValidMonth } from './rules';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null));
const dateStr = z.string().refine(isValidDate, 'Data inválida.');
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).');

export const contentFields = {
  title: z.string().trim().min(3, 'Informe um título (mín. 3 caracteres).').max(190),
  format: z.enum(CONTENT_FORMATS),
  brandId: idSchema.nullable().optional(),
  socialProfileId: idSchema.nullable().optional(),
  pillarId: idSchema.nullable().optional(),
  campaignId: idSchema.nullable().optional(),
  theme: optional(190),
  objective: optional(5000),
  audience: optional(500),
  brief: optional(10000),
  scheduledDate: dateStr
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  scheduledTime: timeStr
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  assigneeUserId: idSchema.nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
};

export const createContentSchema = z.object({
  clientId: idSchema,
  requestId: idSchema.nullable().optional(),
  ...contentFields,
});
export type CreateContentInput = z.infer<typeof createContentSchema>;

export const updateContentSchema = z.object(contentFields).partial().strict();
export type UpdateContentInput = z.infer<typeof updateContentSchema>;

export const contentStatusSchema = z.object({
  to: z.enum(CONTENT_STATUSES),
  message: z.string().trim().max(2000).optional(),
});

export const pillarSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  color: z.enum(['blue', 'violet', 'green', 'orange', 'red', 'gray']),
  description: optional(500),
  active: z.boolean().optional(),
});

export const campaignSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(190),
    description: optional(1000),
    startDate: dateStr
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    endDate: dateStr
      .nullable()
      .optional()
      .or(z.literal('').transform(() => null)),
    status: z.enum(['active', 'inactive']).optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, {
    message: 'A data final deve ser igual ou posterior à inicial.',
    path: ['endDate'],
  });

export const contentFiltersSchema = z.object({
  view: z.enum(['calendario', 'semana', 'agenda', 'lista', 'kanban']).optional(),
  mes: z.string().refine(isValidMonth).optional(),
  dia: dateStr.optional(),
  clientId: idSchema.optional(),
  brandId: idSchema.optional(),
  network: z
    .enum(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'pinterest', 'other'])
    .optional(),
  format: z.enum(CONTENT_FORMATS).optional(),
  status: z.union([z.enum(CONTENT_STATUSES), z.literal('open')]).optional(),
  assignee: z.union([idSchema, z.literal('me'), z.literal('none')]).optional(),
  pillarId: idSchema.optional(),
  campaignId: idSchema.optional(),
  q: z.string().trim().max(100).optional(),
  before: idSchema.optional(),
  overdue: z.literal('1').optional(),
  archived: z.literal('1').optional(),
});
export type ContentFilters = z.infer<typeof contentFiltersSchema>;
