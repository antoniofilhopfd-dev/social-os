import { getDb } from '@/db';
import { route } from '@/core/http';
import { beginSetup } from '@/modules/auth/twofactor';

export const POST = route(async ({ ctx }) => beginSetup(getDb(), ctx));
