import { z } from 'zod';
import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import {
  getAiConnection,
  removeAiConnection,
  saveAiConnection,
} from '@/modules/integrations/service';

const body = z.object({
  apiKey: z.string().max(400).optional(),
  model: z.string().min(1).max(80),
});

export const GET = route(async ({ ctx }) => getAiConnection(getDb(), ctx));
export const PUT = route(async ({ req, ctx }) => {
  await saveAiConnection(getDb(), ctx, await readJson(req, body));
});
export const DELETE = route(async ({ ctx }) => {
  await removeAiConnection(getDb(), ctx);
});
