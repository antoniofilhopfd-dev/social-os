import { getDb } from '@/db';
import { route } from '@/core/http';
import { listTaskAssignees } from '@/modules/tasks/service';

export const GET = route(async ({ ctx }) => ({ items: await listTaskAssignees(getDb(), ctx) }));
