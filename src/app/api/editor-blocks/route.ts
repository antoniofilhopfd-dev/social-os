import { getDb } from '@/db';
import { readJson, route } from '@/core/http';
import { listBlocks, saveBlock } from '@/modules/editor/service';
import { blockSchema } from '@/modules/editor/schema';

export const GET = route(async ({ ctx }) => ({ items: await listBlocks(getDb(), ctx) }));
export const POST = route(async ({ req, ctx }) =>
  saveBlock(getDb(), ctx, null, await readJson(req, blockSchema)),
);
