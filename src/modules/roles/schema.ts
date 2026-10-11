import { z } from 'zod';

export const roleSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  description: z.string().trim().max(255).optional(),
  kind: z.enum(['internal', 'external']),
  permissions: z.array(z.string().max(64)).max(200),
});
