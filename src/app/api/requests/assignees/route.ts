import { getDb } from '@/db';
import { route } from '@/core/http';
import { listAssignees } from '@/modules/requests/service';

export const GET = route(async ({ ctx }) => ({ assignees: await listAssignees(getDb(), ctx) }));
