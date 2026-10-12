import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { resetTwoFactorForMember } from '@/modules/team/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) => {
  await resetTwoFactorForMember(getDb(), ctx, idParam(params.id));
});
