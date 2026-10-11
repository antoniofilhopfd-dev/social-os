import { z } from 'zod';
import { getDb } from '@/db';
import { publicRoute, readJson } from '@/core/http';
import { completePasswordReset } from '@/modules/auth/service';

const body = z.object({ token: z.string().min(20).max(100), password: z.string().max(256) });

export const POST = publicRoute(async ({ req, ip }) => {
  const input = await readJson(req, body);
  await completePasswordReset(getDb(), { ...input, ip });
  return { ok: true };
});
