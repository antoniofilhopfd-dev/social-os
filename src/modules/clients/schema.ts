import { z } from 'zod';
import { NETWORKS } from '@/db/schema';
import { idSchema } from '@/core/api-schemas';

/** Texto opcional: aparado, vazio vira null. */
const optText = (max: number) =>
  z
    .string()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => v.trim() || null)
    .nullable()
    .optional();

export const clientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(190),
});

export const clientUpdateSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome.').max(190),
    status: z.enum(['active', 'inactive']),
    ownerUserId: idSchema.nullable(),
    objectives: optText(5000),
    audience: optText(5000),
    toneOfVoice: optText(5000),
    editorialGuidelines: optText(10000),
    languageRestrictions: optText(5000),
    allowedTopics: optText(5000),
    forbiddenTopics: optText(5000),
    visualIdentity: optText(5000),
    recurringInfo: optText(5000),
    internalNotes: optText(5000),
    approvalFlow: z.enum(['internal_then_client', 'client_only', 'internal_only']),
    slaResponseHours: z
      .number()
      .int()
      .min(1, 'Mínimo 1 hora.')
      .max(720, 'Máximo 720 horas.')
      .nullable(),
    slaDeliveryDays: z
      .number()
      .int()
      .min(1, 'Mínimo 1 dia.')
      .max(365, 'Máximo 365 dias.')
      .nullable(),
  })
  .partial()
  .strict();
export type ClientUpdate = z.infer<typeof clientUpdateSchema>;

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(190),
  email: z
    .string()
    .trim()
    .max(254)
    .email('E-mail inválido.')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  phone: z
    .string()
    .trim()
    .max(40)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  roleTitle: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  isPrimary: z.boolean().optional(),
});

export const dateSchema = z.object({
  label: z.string().trim().min(2, 'Informe a descrição.').max(190),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  yearly: z.boolean().optional(),
  note: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});

export const brandSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.').max(190),
  status: z.enum(['active', 'inactive']).optional(),
  description: optText(5000),
  objectives: optText(5000),
  audience: optText(5000),
  toneOfVoice: optText(5000),
  editorialGuidelines: optText(10000),
});

export const profileSchema = z.object({
  network: z.enum(NETWORKS),
  profileName: z.string().trim().min(2, 'Informe o nome do perfil.').max(190),
  handle: z.string().trim().min(1, 'Informe o identificador.').max(190),
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\/\S+$/i, 'A URL deve começar com http:// ou https://')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  ownerUserId: idSchema.nullable().optional(),
  status: z.enum(['active', 'paused', 'inactive']).optional(),
  accountType: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  notes: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
});
