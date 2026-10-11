import { z } from 'zod';
import { NETWORKS, PRIORITIES } from '@/db/schema';
import { idSchema } from '@/core/api-schemas';
import { CONFIGURABLE_KEYS } from './rules';

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null));

export const requestFields = {
  title: z.string().trim().min(3, 'Informe um título (mín. 3 caracteres).').max(190),
  description: z.string().trim().min(5, 'Descreva a solicitação.').max(10000),
  brandId: idSchema.nullable().optional(),
  objective: optional(5000),
  audience: optional(500),
  network: z.enum(NETWORKS).nullable().optional(),
  format: optional(80),
  desiredDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  referenceNotes: optional(5000),
  approvalRequired: z.boolean().optional(),
  priority: z.enum(PRIORITIES).optional(),
  urgencyReason: optional(500),
};

export const createRequestSchema = z.object({
  clientId: idSchema,
  typeId: idSchema,
  requesterName: optional(190),
  force: z.boolean().optional(),
  ...requestFields,
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const updateRequestSchema = z
  .object({
    title: requestFields.title,
    description: requestFields.description,
    brandId: requestFields.brandId,
    objective: requestFields.objective,
    audience: requestFields.audience,
    network: requestFields.network,
    format: requestFields.format,
    desiredDate: requestFields.desiredDate,
    referenceNotes: requestFields.referenceNotes,
    approvalRequired: requestFields.approvalRequired,
    priority: requestFields.priority,
    urgencyReason: requestFields.urgencyReason,
    typeId: idSchema,
  })
  .partial()
  .strict();
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

export const statusSchema = z.object({
  to: z.enum(['new', 'in_triage', 'awaiting_info', 'accepted', 'rejected', 'cancelled']),
  message: z.string().trim().max(5000).optional(),
});

export const assignSchema = z.object({
  assigneeUserId: idSchema.nullable(),
  estimatedDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')
    .nullable()
    .optional(),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Escreva o comentário.').max(5000),
  internalOnly: z.boolean().optional(),
});

export const requestTypeSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  requiredFields: z
    .array(z.enum(CONFIGURABLE_KEYS as [string, ...string[]]))
    .max(CONFIGURABLE_KEYS.length),
  active: z.boolean().optional(),
});

export const listFiltersSchema = z.object({
  status: z
    .enum(['new', 'in_triage', 'awaiting_info', 'accepted', 'rejected', 'cancelled', 'open'])
    .optional(),
  priority: z.enum(PRIORITIES).optional(),
  clientId: idSchema.optional(),
  assignee: z.union([idSchema, z.literal('me'), z.literal('none')]).optional(),
  overdue: z.literal('1').optional(),
  q: z.string().trim().max(100).optional(),
  before: idSchema.optional(),
});

/** Parâmetros de URL: valores vazios (campos em branco do formulário) são descartados antes da validação. */
export function cleanParams(
  params: Record<string, string | string[] | undefined>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0] : v] as const)
      .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''),
  );
}
