import { getDb } from '@/db';
import { idParam } from '@/core/api-schemas';
import { readJson, route } from '@/core/http';
import { deleteContact, updateContact } from '@/modules/clients/children';
import { contactSchema } from '@/modules/clients/schema';

export const PUT = route<{ id: string; contactId: string }>(async ({ req, ctx, params }) => {
  await updateContact(
    getDb(),
    ctx,
    idParam(params.id),
    idParam(params.contactId),
    await readJson(req, contactSchema),
  );
});

export const DELETE = route<{ id: string; contactId: string }>(async ({ ctx, params }) => {
  await deleteContact(getDb(), ctx, idParam(params.id), idParam(params.contactId));
});
