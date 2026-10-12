import { getDb } from '@/db';
import { route } from '@/core/http';
import { twoFactorStatus } from '@/modules/auth/twofactor';

export const GET = route(async ({ ctx }) => twoFactorStatus(getDb(), ctx));
