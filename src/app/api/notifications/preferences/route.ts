import { z } from 'zod';
import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { getPreferences, setPreference } from '@/modules/notifications/service';

const body = z.object({ type: z.string().max(48), enabled: z.boolean() });

export const GET = route(async ({ ctx }) => ({ preferences: await getPreferences(getDb(), ctx) }));

export const PUT = route(async ({ req, ctx }) => {
  const { type, enabled } = await readJson(req, body);
  await setPreference(getDb(), ctx, type, enabled);
});
