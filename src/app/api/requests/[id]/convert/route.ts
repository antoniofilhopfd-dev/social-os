import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { convertRequestToContent } from '@/modules/contents/service';

export const POST = route<{ id: string }>(async ({ ctx, params }) =>
  convertRequestToContent(getDb(), ctx, idParam(params.id)),
);
