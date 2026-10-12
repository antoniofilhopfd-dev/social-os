import { z } from 'zod';
import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { enableTwoFactor } from '@/modules/auth/twofactor';

export const POST = route(async ({ req, ctx }) =>
  enableTwoFactor(
    getDb(),
    ctx,
    (await readJson(req, z.object({ code: z.string().trim().min(6).max(10) }))).code,
  ),
);
