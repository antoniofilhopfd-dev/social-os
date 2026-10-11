import { z } from 'zod';

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(190),
});
