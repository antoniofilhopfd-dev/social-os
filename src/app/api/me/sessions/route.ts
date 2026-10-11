import { getDb } from '@/db';
import { route } from '@/core/http';
import { mySessions, revokeOtherSessions } from '@/modules/auth/service';

export const GET = route(async ({ ctx }) => ({ sessions: await mySessions(getDb(), ctx) }));

/** Encerra todas as outras sessões do usuário, mantendo a atual. */
export const DELETE = route(async ({ ctx }) => ({
  revoked: await revokeOtherSessions(getDb(), ctx),
}));
