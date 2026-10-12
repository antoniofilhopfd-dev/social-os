import type { EditorBody } from '@/db/schema';

export type PublicationStatus = 'scheduled' | 'published' | 'failed' | 'cancelled';
export type QueueState = 'overdue' | 'today' | 'upcoming' | 'none';

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  scheduled: 'Programada',
  published: 'Publicada',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

/** Situação na fila: atrasada quando o dia já passou, ou é hoje e o horário já passou. */
export function queueState(
  p: { status: PublicationStatus; scheduledDate: string; scheduledTime: string | null },
  today: string,
  nowTime: string,
): QueueState {
  if (p.status !== 'scheduled') return 'none';
  if (p.scheduledDate < today) return 'overdue';
  if (p.scheduledDate === today)
    return p.scheduledTime && p.scheduledTime.slice(0, 5) < nowTime ? 'overdue' : 'today';
  return 'upcoming';
}

/** Aceita apenas http(s) sem credenciais embutidas. Devolve a URL normalizada ou null. */
export function parsePostUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v || v.length > 500) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Texto final para copiar: legenda + chamada para ação (se ainda não estiver na legenda) + hashtags não repetidas. */
export function buildPostText(b: EditorBody): string {
  const parts = [b.caption.trim()];
  if (b.cta.trim() && !b.caption.includes(b.cta.trim())) parts.push(b.cta.trim());
  const tags = b.hashtags.trim();
  if (tags && !b.caption.includes(tags)) parts.push(tags);
  return parts.filter(Boolean).join('\n\n');
}
