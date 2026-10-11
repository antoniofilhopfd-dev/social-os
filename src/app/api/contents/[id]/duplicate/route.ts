import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { duplicateContent } from '@/modules/contents/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) =>
  duplicateContent(getDb(), ctx, idParam(params.id)),
);
