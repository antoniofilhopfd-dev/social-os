import { z } from 'zod';
import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { disableTwoFactor } from '@/modules/auth/twofactor';

export const POST = route(async ({ req, ctx }) => {
  await disableTwoFactor(
    getDb(),
    ctx,
    await readJson(
      req,
      z.object({ password: z.string().min(1).max(256), code: z.string().trim().min(6).max(32) }),
    ),
  );
});
