import { getDb } from '@/db';
import { route } from '@/core/http';
import { markAllRead } from '@/modules/notifications/service';

export const POST = route(async ({ ctx }) => ({ updated: await markAllRead(getDb(), ctx) }));
