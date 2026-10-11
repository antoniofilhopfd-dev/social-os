import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { route } from '@/core/http';
import { getEditor } from '@/modules/editor/service';

export const GET = route<{ id: string }>(async ({ ctx, params }) =>
  getEditor(getDb(), ctx, idParam(params.id)),
);
