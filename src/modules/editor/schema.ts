import { z } from 'zod';
import { idSchema } from '@/core/api-schemas';
import { CHECKLISTS, HARD_LIMITS, MAX_SLIDES, TEXT_FIELDS } from './rules';

const ALL_CHECK_IDS = new Set(Object.values(CHECKLISTS).flatMap((l) => l.map((i) => i.id)));

const textField = (f: (typeof TEXT_FIELDS)[number]) =>
  z.string().max(HARD_LIMITS[f], `Use no máximo ${HARD_LIMITS[f]} caracteres.`);

export const editorBodySchema = z.object({
  ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, textField(f)])),
  slides: z
    .array(z.object({ title: z.string().max(200), text: z.string().max(3000) }))
    .max(MAX_SLIDES, `No máximo ${MAX_SLIDES} slides.`),
  checklist: z
    .array(z.string().refine((id) => ALL_CHECK_IDS.has(id), 'Item de checklist inválido.'))
    .max(40),
}) as unknown as z.ZodType<import('@/db/schema').EditorBody>;

export const saveDraftSchema = z.object({
  baseRevision: z.number().int().min(0),
  body: editorBodySchema,
});
export const saveVersionSchema = z.object({ note: z.string().trim().max(500).optional() });
export const restoreSchema = z.object({ baseRevision: z.number().int().min(0) });
export const compareSchema = z.object({
  a: z.coerce.number().int().min(1),
  b: z.coerce.number().int().min(1),
});

export const blockSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  kind: z.enum(['cta', 'hashtags', 'disclaimer', 'signature', 'other']),
  text: z.string().trim().min(1, 'Informe o texto.').max(3000),
  clientId: idSchema.nullable().optional(),
});

export const templateSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(120),
  format: z.string().max(32).nullable().optional(),
  clientId: idSchema.nullable().optional(),
  fromContentId: idSchema.optional(),
  body: editorBodySchema.optional(),
});
