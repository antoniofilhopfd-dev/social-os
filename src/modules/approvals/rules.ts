import type { EditorBody } from '@/db/schema';

export type ApprovalStatus =
  'pending' | 'approved' | 'changes_requested' | 'cancelled' | 'superseded';

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Aguardando decisão',
  approved: 'Aprovado',
  changes_requested: 'Ajustes solicitados',
  cancelled: 'Cancelada',
  superseded: 'Substituída',
};

/** Campos do editor que o cliente enxerga. Observações de produção, de publicação e referências são internas. */
export const CLIENT_BODY_FIELDS = [
  'hook',
  'caption',
  'script',
  'cta',
  'hashtags',
  'coverText',
  'altText',
] as const;

export type ClientBody = Pick<EditorBody, (typeof CLIENT_BODY_FIELDS)[number] | 'slides'>;

export function clientView(body: EditorBody): ClientBody {
  const out = { slides: body.slides.map((s) => ({ title: s.title, text: s.text })) } as ClientBody;
  for (const f of CLIENT_BODY_FIELDS) out[f] = body[f];
  return out;
}

/** O conteúdo só pode ser enviado se houver algum texto/roteiro/slide para o cliente avaliar. */
export function hasReviewableContent(body: EditorBody): boolean {
  return (
    CLIENT_BODY_FIELDS.some((f) => body[f].trim().length > 0) ||
    body.slides.some((s) => s.title.trim() || s.text.trim())
  );
}

/** Situações do conteúdo a partir das quais é possível enviar ao cliente. */
export const SENDABLE_STATUSES = ['in_production', 'internal_review', 'changes_requested'] as const;
