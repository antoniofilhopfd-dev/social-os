import type { REQUEST_STATUSES } from '@/db/schema';

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Nova',
  in_triage: 'Em triagem',
  awaiting_info: 'Aguardando informações',
  accepted: 'Aceita',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
};

export const PRIORITY_LABELS = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
} as const;

/** Estados abertos: ainda exigem atenção da operação. */
export const OPEN_STATUSES: RequestStatus[] = ['new', 'in_triage', 'awaiting_info'];
/** Estados que contam para a detecção de duplicidade. */
export const DUPLICATE_STATUSES: RequestStatus[] = [
  'new',
  'in_triage',
  'awaiting_info',
  'accepted',
];

/** Transições permitidas. Qualquer outra é recusada no servidor. */
export const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ['in_triage', 'rejected', 'cancelled'],
  in_triage: ['awaiting_info', 'accepted', 'rejected', 'cancelled'],
  awaiting_info: ['in_triage', 'rejected', 'cancelled'],
  accepted: ['cancelled'],
  rejected: ['in_triage'],
  cancelled: ['in_triage'],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Destinos que exigem uma mensagem (motivo, pergunta ao solicitante ou justificativa de reabertura). */
export const MESSAGE_REQUIRED: RequestStatus[] = ['awaiting_info', 'rejected', 'cancelled'];

// ------------------------------------------------------------ campos por tipo
/** Campos que um tipo de solicitação pode exigir (cliente, título e descrição são sempre obrigatórios). */
export const CONFIGURABLE_FIELDS = {
  brandId: 'Marca',
  objective: 'Objetivo',
  audience: 'Público',
  network: 'Rede social',
  format: 'Formato',
  desiredDate: 'Data desejada',
  referenceNotes: 'Referências',
} as const;
export type ConfigurableField = keyof typeof CONFIGURABLE_FIELDS;
export const CONFIGURABLE_KEYS = Object.keys(CONFIGURABLE_FIELDS) as ConfigurableField[];

export const DEFAULT_TYPES: { name: string; required: ConfigurableField[] }[] = [
  {
    name: 'Criação de conteúdo (post)',
    required: ['network', 'format', 'objective', 'desiredDate'],
  },
  { name: 'Vídeo / Reels / Stories', required: ['network', 'format', 'objective', 'desiredDate'] },
  { name: 'Ajuste em conteúdo existente', required: [] },
  { name: 'Ideia ou pauta', required: ['objective'] },
  { name: 'Outro', required: [] },
];

export function missingFields(
  values: Partial<Record<ConfigurableField, unknown>>,
  required: readonly string[],
): ConfigurableField[] {
  return (required as ConfigurableField[]).filter((k) => {
    const v = values[k];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });
}

// -------------------------------------------------------------------- prazos
export type SlaState = 'ok' | 'response_overdue' | 'due_overdue';

export function slaState(
  r: {
    status: RequestStatus;
    firstResponseDueAt: Date | null;
    firstResponseAt: Date | null;
    estimatedDue: string | null;
  },
  now: Date,
): SlaState {
  if (
    r.status === 'new' &&
    !r.firstResponseAt &&
    r.firstResponseDueAt &&
    r.firstResponseDueAt.getTime() < now.getTime()
  ) {
    return 'response_overdue';
  }
  if (
    OPEN_STATUSES.includes(r.status) &&
    r.estimatedDue &&
    r.estimatedDue < now.toISOString().slice(0, 10)
  )
    return 'due_overdue';
  return 'ok';
}

// -------------------------------------------------------------- duplicidade
const STOPWORDS = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'para',
  'por',
  'com',
  'em',
  'um',
  'uma',
  'o',
  'a',
  'os',
  'as',
  'e',
  'no',
  'na',
  'nos',
  'nas',
  'ao',
  'que',
]);

export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
  );
}

/** Similaridade de Jaccard entre os conjuntos de palavras significativas dos títulos. */
export function titleSimilarity(a: string, b: string): number {
  const A = titleWords(a);
  const B = titleWords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const DUPLICATE_THRESHOLD = 0.7;
export const DUPLICATE_WINDOW_DAYS = 30;
