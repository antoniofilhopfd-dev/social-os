import { z } from 'zod';
import { getDb } from '@/db';
import { setSessionCookie } from '@/core/auth/cookies';
import { publicRoute, readJson } from '@/core/http';
import { login } from '@/modules/auth/service';

const body = z.object({
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
});

export const POST = publicRoute(async ({ req, ip, userAgent }) => {
  const input = await readJson(req, body);
  const result = await login(getDb(), { ...input, ip, userAgent });
  await setSessionCookie(result.token, result.expiresAt);
  return { ok: true };
});
