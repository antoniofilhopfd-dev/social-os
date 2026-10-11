import { getDb } from '@/db';
import { clearSessionCookie } from '@/core/auth/cookies';
import { route } from '@/core/http';
import { logout } from '@/modules/auth/service';

export const POST = route(async ({ ctx }) => {
  await logout(getDb(), ctx);
  await clearSessionCookie();
});
