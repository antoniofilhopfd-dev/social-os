import { z } from 'zod';
import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { suggest } from '@/modules/ai/service';
import type { AiTask } from '@/integrations/ai';

const body = z.object({
  task: z.enum([
    'caption',
    'tone_variations',
    'titles',
    'cta',
    'hashtags',
    'alt_text',
    'proofread',
    'clarity',
  ]),
  instruction: z.string().trim().max(800).optional(),
});

export const POST = route<{ id: string }>(async ({ req, ctx, params }) => {
  const i = await readJson(req, body);
  return suggest(getDb(), ctx, idParam(params.id), {
    task: i.task as AiTask,
    instruction: i.instruction,
  });
});
