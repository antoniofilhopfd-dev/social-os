import { z } from 'zod';
import { getDb } from '@/db';
import { setSessionCookie } from '@/core/auth/cookies';
import { publicRoute, readJson } from '@/core/http';
import { acceptInvitation } from '@/modules/auth/service';

const body = z.object({
  token: z.string().min(20).max(100),
  password: z.string().max(256).optional(),
  name: z.string().trim().min(2).max(190).optional(),
});

export const POST = publicRoute(async ({ req, ip, userAgent, auth }) => {
  const input = await readJson(req, body);
  const r = await acceptInvitation(getDb(), {
    ...input,
    currentUserId: auth?.user.id ?? null,
    ip,
    userAgent,
  });
  if (r.token) await setSessionCookie(r.token, new Date(Date.now() + 30 * 24 * 3600 * 1000));
  return { ok: true, newAccount: r.newAccount };
});
