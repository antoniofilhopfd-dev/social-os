import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { getEnv } from '@/core/env';
import { route } from '@/core/http';
import { createResetLinkForMember } from '@/modules/team/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  const r = await createResetLinkForMember(getDb(), ctx, idParam(params.id));
  return { expiresAt: r.expiresAt, link: `${getEnv().APP_URL}/redefinir-senha/${r.token}` };
});
