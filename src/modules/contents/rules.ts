import type { CONTENT_FORMATS, CONTENT_STATUSES } from '@/db/schema';

export type ContentStatus = (typeof CONTENT_STATUSES)[number];
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  static_post: 'Post estático',
  carousel: 'Carrossel',
  reels: 'Reels',
  stories: 'Stories',
  story_sequence: 'Sequência de Stories',
  video: 'Vídeo',
  text: 'Texto',
  institutional: 'Conteúdo institucional',
  educational: 'Conteúdo educativo',
  promotional: 'Promocional orgânico',
  other: 'Outro',
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: 'Rascunho',
  in_production: 'Em produção',
  internal_review: 'Em revisão interna',
  awaiting_client: 'Aguardando cliente',
  changes_requested: 'Ajustes solicitados',
  approved: 'Aprovado',
  scheduled: 'Programado',
  published: 'Publicado',
  cancelled: 'Cancelado',
  archived: 'Arquivado',
};

export const STATUS_TONE: Record<
  ContentStatus,
  'neutral' | 'info' | 'warning' | 'success' | 'danger'
> = {
  draft: 'neutral',
  in_production: 'info',
  internal_review: 'warning',
  awaiting_client: 'warning',
  changes_requested: 'danger',
  approved: 'success',
  scheduled: 'info',
  published: 'success',
  cancelled: 'neutral',
  archived: 'neutral',
};

/** Colunas do Kanban, na ordem do fluxo. Cancelado e arquivado ficam fora da visão padrão. */
export const KANBAN_COLUMNS: ContentStatus[] = [
  'draft',
  'in_production',
  'internal_review',
  'awaiting_client',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
];

/** Estados "encerrados": não contam como trabalho em aberto. */
export const CLOSED_STATUSES: ContentStatus[] = ['published', 'cancelled', 'archived'];

/**
 * Estados controlados por outros módulos: o usuário NÃO pode atribuí-los manualmente.
 * `awaiting_client`, `changes_requested` e `approved` pertencem ao fluxo de aprovação (Etapa 08);
 * `scheduled` e `published` ao registro de publicação (Etapa 09).
 */
export const RESERVED_STATUSES: ContentStatus[] = [
  'awaiting_client',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
];

/** Transições manuais permitidas nesta etapa. */
export const MANUAL_TRANSITIONS: Partial<Record<ContentStatus, ContentStatus[]>> = {
  draft: ['in_production', 'cancelled', 'archived'],
  in_production: ['internal_review', 'draft', 'cancelled'],
  internal_review: ['in_production', 'cancelled'],
  // Conteúdo já no fluxo do cliente/publicação só pode ser cancelado manualmente.
  awaiting_client: ['cancelled'],
  changes_requested: ['cancelled'],
  approved: ['cancelled'],
  scheduled: ['cancelled'],
  cancelled: ['draft', 'archived'],
  archived: ['draft'],
  // published: nenhuma transição manual
};

export function canTransitionManually(from: ContentStatus, to: ContentStatus): boolean {
  return (MANUAL_TRANSITIONS[from] ?? []).includes(to);
}

/** Estados que o cliente externo pode enxergar (nada é exibido antes de o conteúdo ser enviado a ele). */
export const CLIENT_VISIBLE_STATUSES: ContentStatus[] = [
  'awaiting_client',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
];

/** Estados em que a exclusão lógica é recusada (conteúdo já no fluxo do cliente ou publicado). */
export const NON_DELETABLE_STATUSES: ContentStatus[] = [
  'awaiting_client',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
];

/** Mapeia o texto livre de formato de uma solicitação para um formato de conteúdo (melhor esforço). */
export function formatFromRequest(text: string | null | undefined): ContentFormat {
  const t = (text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (t.includes('carrossel') || t.includes('carousel')) return 'carousel';
  if (t.includes('reels') || t.includes('reel')) return 'reels';
  if (t.includes('sequencia')) return 'story_sequence';
  if (t.includes('stor')) return 'stories';
  if (t.includes('video')) return 'video';
  if (t.includes('texto')) return 'text';
  if (t.includes('post') || t.includes('estatico') || t.includes('imagem')) return 'static_post';
  return 'other';
}

export type OverdueState = 'ok' | 'overdue' | 'due_soon';

/** Atraso: data prevista passada e conteúdo ainda não encerrado. "Próximo": até 2 dias e ainda em rascunho/produção. */
export function scheduleState(
  c: { status: ContentStatus; scheduledDate: string | null },
  today: string,
): OverdueState {
  if (!c.scheduledDate || CLOSED_STATUSES.includes(c.status)) return 'ok';
  if (c.scheduledDate < today) return 'overdue';
  const limit = addDays(today, 2);
  if (c.scheduledDate <= limit && (c.status === 'draft' || c.status === 'in_production'))
    return 'due_soon';
  return 'ok';
}

// ------------------------------------------------------------------ calendário
const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const fromIso = (s: string) => new Date(`${s}T00:00:00Z`);

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromIso(s);
  return (
    !Number.isNaN(d.getTime()) &&
    isoDate(d) === s &&
    d.getUTCFullYear() >= 2000 &&
    d.getUTCFullYear() <= 2100
  );
}

export function addDays(s: string, n: number): string {
  const d = fromIso(s);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}

export function isValidMonth(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym) && isValidDate(`${ym}-01`);
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Semanas (domingo a sábado) que cobrem o mês, incluindo dias vizinhos. */
export function monthGrid(ym: string): { date: string; inMonth: boolean }[][] {
  const first = fromIso(`${ym}-01`);
  const start = addDays(`${ym}-01`, -first.getUTCDay());
  const weeks: { date: string; inMonth: boolean }[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(cursor, i);
      return { date, inMonth: date.startsWith(ym) };
    });
    if (w >= 4 && !week.some((d) => d.inMonth)) break;
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

/** Dias (domingo a sábado) da semana que contém `date`. */
export function weekDays(date: string): string[] {
  const start = addDays(date, -fromIso(date).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function monthRange(ym: string): { from: string; to: string } {
  const grid = monthGrid(ym);
  return { from: grid[0]![0]!.date, to: grid[grid.length - 1]![6]!.date };
}

export const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

export function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return `${MONTH_NAMES[m - 1]} de ${y}`;
}

export const PILLAR_COLORS: Record<string, string> = {
  blue: 'Azul',
  violet: 'Violeta',
  green: 'Verde',
  orange: 'Laranja',
  red: 'Vermelho',
  gray: 'Cinza',
};
