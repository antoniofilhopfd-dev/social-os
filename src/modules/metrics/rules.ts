export const METRIC_FIELDS = [
  'reach',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'videoViews',
  'followersGained',
] as const;
export type MetricField = (typeof METRIC_FIELDS)[number];

export const METRIC_LABELS: Record<MetricField | 'interactions' | 'engagementRate', string> = {
  reach: 'Alcance',
  impressions: 'Impressões',
  likes: 'Curtidas',
  comments: 'Comentários',
  shares: 'Compartilhamentos',
  saves: 'Salvamentos',
  clicks: 'Cliques',
  videoViews: 'Visualizações de vídeo',
  followersGained: 'Novos seguidores',
  interactions: 'Interações',
  engagementRate: 'Taxa de engajamento',
};

export const MAX_METRIC_VALUE = 2_000_000_000;

export type MetricValues = Partial<Record<MetricField, number | null>>;

/** Interações = curtidas + comentários + compartilhamentos + salvamentos. Nulo quando nenhuma foi informada. */
export function interactions(m: MetricValues): number | null {
  const parts = [m.likes, m.comments, m.shares, m.saves];
  if (parts.every((p) => p == null)) return null;
  return parts.reduce<number>((s, p) => s + (p ?? 0), 0);
}

/** Taxa de engajamento = interações ÷ alcance, em %, com uma casa. Nula sem alcance ou sem interações. */
export function engagementRate(m: MetricValues): number | null {
  const i = interactions(m);
  if (i == null || !m.reach || m.reach <= 0) return null;
  return Math.round((i / m.reach) * 1000) / 10;
}

/** Soma ignorando valores não informados (nulo ≠ zero). Devolve null se nenhum valor foi informado. */
export function sumKnown(values: (number | null | undefined)[]): number | null {
  const known = values.filter((v): v is number => v != null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
}

const csvCell = (v: unknown): string => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  // proteção contra injeção de fórmulas em planilhas
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV (separador ";" e BOM UTF-8, para abrir corretamente no Excel em pt-BR). */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
