import { z } from 'zod';
import { PROJECT_STATUSES, TASK_STATUSES } from '@/db/schema';
import { idSchema } from '@/core/api-schemas';
import { isValidDate } from '@/modules/contents/rules';

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null));
const dateStr = z
  .string()
  .refine(isValidDate, 'Data inválida.')
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));

export const taskFields = {
  title: z.string().trim().min(3, 'Informe um título (mín. 3 caracteres).').max(190),
  description: opt(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueDate: dateStr,
  assigneeUserId: idSchema.nullable().optional(),
  projectId: idSchema.nullable().optional(),
  contentId: idSchema.nullable().optional(),
};
export const createTaskSchema = z.object({
  clientId: idSchema.nullable().optional(),
  ...taskFields,
});
export const updateTaskSchema = z.object(taskFields).partial().strict();
export const taskStatusSchema = z.object({
  to: z.enum(TASK_STATUSES),
  reason: z.string().trim().max(500).optional(),
});
export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Escreva o comentário.').max(3000),
});
export const checklistAddSchema = z.object({ text: z.string().trim().min(1).max(300) });
export const checklistPatchSchema = z
  .object({ text: z.string().trim().min(1).max(300).optional(), done: z.boolean().optional() })
  .strict();

export const taskFiltersSchema = z.object({
  clientId: idSchema.optional(),
  projectId: idSchema.optional(),
  contentId: idSchema.optional(),
  status: z.union([z.enum(TASK_STATUSES), z.literal('open'), z.literal('closed')]).optional(),
  assignee: z.union([idSchema, z.literal('me'), z.literal('none')]).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  overdue: z.literal('1').optional(),
  q: z.string().trim().max(120).optional(),
  view: z.enum(['minhas', 'lista', 'kanban']).optional(),
  before: idSchema.optional(),
});

export const projectFields = {
  name: z.string().trim().min(3, 'Informe o nome (mín. 3 caracteres).').max(190),
  description: opt(5000),
  status: z.enum(PROJECT_STATUSES).optional(),
  startDate: dateStr,
  dueDate: dateStr,
  ownerUserId: idSchema.nullable().optional(),
};
export const createProjectSchema = z.object({ clientId: idSchema, ...projectFields });
export const updateProjectSchema = z.object(projectFields).partial().strict();
