import { z } from 'zod';
import { idSchema } from '@/core/api-schemas';

export const submitSchema = z.object({ message: z.string().trim().max(2000).optional() });
export const decideSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approved'), comment: z.string().trim().max(3000).optional() }),
  z.object({
    decision: z.literal('changes_requested'),
    comment: z
      .string({ error: 'Descreva os ajustes desejados.' })
      .trim()
      .min(3, 'Descreva os ajustes desejados.')
      .max(3000),
  }),
]);
export const approvalCommentSchema = z.object({
  body: z.string().trim().min(1, 'Escreva o comentário.').max(3000),
});
export const approvalFiltersSchema = z.object({
  clientId: idSchema.optional(),
  status: z
    .enum(['pending', 'approved', 'changes_requested', 'cancelled', 'superseded'])
    .optional(),
  before: idSchema.optional(),
});
