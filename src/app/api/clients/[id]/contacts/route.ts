import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { createContact, listContacts } from '@/modules/clients/children';
import { contactSchema } from '@/modules/clients/schema';

export const GET = route<{ id: string }>(async ({ ctx, params }) => ({
  contacts: await listContacts(getDb(), ctx, idParam(params.id)),
}));

export const POST = route<{ id: string }>(async ({ req, ctx, params }) =>
  createContact(getDb(), ctx, idParam(params.id), await readJson(req, contactSchema)),
);
