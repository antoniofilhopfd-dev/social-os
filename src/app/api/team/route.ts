import { getDb } from '@/db';
import { route } from '@/core/http';
import { listTeam } from '@/modules/team/service';

export const GET = route(async ({ ctx }) => listTeam(getDb(), ctx));
