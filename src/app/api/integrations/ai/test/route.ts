import { getDb } from '@/db';
import { route } from '@/core/http';
import { testAiConnection } from '@/modules/integrations/service';

export const POST = route(async ({ ctx }) => {
  await testAiConnection(getDb(), ctx);
});
