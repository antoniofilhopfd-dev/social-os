import type { EditorBody } from '@/db/schema';
import type { ContentFormat } from '@/modules/contents/rules';

export type { EditorBody };

export const EMPTY_BODY: EditorBody = {
  caption: '',
  hook: '',
  script: '',
  cta: '',
  hashtags: '',
  coverText: '',
  altText: '',
  productionNotes: '',
  publishNotes: '',
  references: '',
  slides: [],
  checklist: [],
};

export const TEXT_FIELDS = [
  'caption',
  'hook',
  'script',
  'cta',
  'hashtags',
  'coverText',
  'altText',
  'productionNotes',
  'publishNotes',
  'references',
] as const;
export type TextField = (typeof TEXT_FIELDS)[number];

export const FIELD_LABELS: Record<TextField | 'slides', string> = {
  caption: 'Legenda',
  hook: 'Gancho inicial',
  script: 'Roteiro',
  cta: 'Chamada para ação',
  hashtags: 'Hashtags',
  coverText: 'Texto de capa',
  altText: 'Texto alternativo',
  productionNotes: 'Observações para designer/editor',
  publishNotes: 'Orientações de publicação',
  references: 'Referências e fontes',
  slides: 'Estrutura de slides',
};

/** Limites máximos aceitos pelo servidor (proteção). Limites de cada rede são só avisos, abaixo. */
export const HARD_LIMITS: Record<TextField, number> = {
  caption: 10000,
  hook: 500,
  script: 30000,
  cta: 500,
  hashtags: 2000,
  coverText: 500,
  altText: 1500,
  productionNotes: 5000,
  publishNotes: 3000,
  references: 5000,
};
export const MAX_SLIDES = 20;

export function normalizeBody(input: Partial<EditorBody> | null | undefined): EditorBody {
  const b = { ...EMPTY_BODY, ...(input ?? {}) } as EditorBody;
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, String(b[f] ?? '')])),
    slides: Array.isArray(b.slides)
      ? b.slides.map((s) => ({ title: String(s?.title ?? ''), text: String(s?.text ?? '') }))
      : [],
    checklist: Array.isArray(b.checklist) ? [...new Set(b.checklist.map(String))] : [],
  } as EditorBody;
}

// ---------------------------------------------------------- limites por rede
/**
 * Limites de REFERÊNCIA por rede. São avisos (nunca bloqueiam) e devem ser reconfirmados na documentação
 * oficial de cada plataforma antes de qualquer publicação automática (Etapa 12). As plataformas mudam esses valores.
 */
export const NETWORK_LIMITS: Record<
  string,
  { caption?: number; hashtags?: number; title?: number; label: string }
> = {
  instagram: { caption: 2200, hashtags: 30, label: 'Instagram' },
  facebook: { caption: 63206, label: 'Facebook' },
  tiktok: { caption: 2200, label: 'TikTok' },
  linkedin: { caption: 3000, label: 'LinkedIn' },
  youtube: { caption: 5000, title: 100, label: 'YouTube' },
  pinterest: { caption: 500, title: 100, label: 'Pinterest' },
};

export function hashtagList(text: string): string[] {
  return [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.toLowerCase()))];
}

/** Conta caracteres como o usuário vê (pontos de código, não unidades UTF-16). */
export const charCount = (s: string) => [...s].length;

export interface LimitReport {
  field: string;
  used: number;
  limit: number;
  over: boolean;
}

export function limitReports(network: string | null, body: EditorBody): LimitReport[] {
  const lim = network ? NETWORK_LIMITS[network] : undefined;
  if (!lim) return [];
  const out: LimitReport[] = [];
  if (lim.caption) {
    const used = charCount(body.caption) + (body.hashtags.trim() ? 0 : 0);
    out.push({ field: 'Legenda', used, limit: lim.caption, over: used > lim.caption });
  }
  if (lim.hashtags) {
    const used = hashtagList(`${body.caption} ${body.hashtags}`).length;
    out.push({ field: 'Hashtags', used, limit: lim.hashtags, over: used > lim.hashtags });
  }
  return out;
}

// -------------------------------------------------------- obrigatoriedade/checklist
const needs = (b: EditorBody, f: TextField) => b[f].trim().length === 0;

/** Campos que um formato normalmente exige para estar "pronto". Só gera alertas; não bloqueia o salvamento. */
export function missingForFormat(format: ContentFormat, body: EditorBody): string[] {
  const out: string[] = [];
  const req = (cond: boolean, label: string) => cond && out.push(label);
  switch (format) {
    case 'static_post':
      req(needs(body, 'caption'), 'Legenda');
      req(
        needs(body, 'coverText') && needs(body, 'productionNotes'),
        'Texto de capa ou observações para o designer',
      );
      break;
    case 'carousel':
      req(needs(body, 'caption'), 'Legenda');
      req(
        body.slides.filter((s) => s.title.trim() || s.text.trim()).length < 2,
        'Pelo menos 2 slides',
      );
      break;
    case 'reels':
    case 'video':
      req(needs(body, 'hook'), 'Gancho inicial');
      req(needs(body, 'script'), 'Roteiro');
      req(needs(body, 'caption'), 'Legenda');
      break;
    case 'stories':
    case 'story_sequence':
      req(needs(body, 'script') && body.slides.length === 0, 'Roteiro ou sequência de telas');
      break;
    case 'text':
      req(needs(body, 'caption'), 'Texto');
      break;
    default:
      req(needs(body, 'caption') && needs(body, 'script'), 'Legenda ou roteiro');
  }
  return out;
}

export interface ChecklistItem {
  id: string;
  label: string;
}
const COMMON: ChecklistItem[] = [
  { id: 'ortografia', label: 'Ortografia e gramática revisadas' },
  { id: 'diretrizes', label: 'Alinhado ao tom de voz e às diretrizes do cliente' },
  { id: 'temas', label: 'Sem temas proibidos nem termos restritos' },
];
export const CHECKLISTS: Record<ContentFormat, ChecklistItem[]> = {
  static_post: [
    ...COMMON,
    { id: 'arte', label: 'Arte final anexada' },
    { id: 'alt', label: 'Texto alternativo definido' },
    { id: 'cta', label: 'Chamada para ação definida' },
  ],
  carousel: [
    ...COMMON,
    { id: 'capa', label: 'Capa do carrossel definida' },
    { id: 'ordem', label: 'Ordem e quantidade de slides conferidas' },
    { id: 'alt', label: 'Texto alternativo definido' },
    { id: 'cta', label: 'Chamada para ação no último slide' },
  ],
  reels: [
    ...COMMON,
    { id: 'gancho', label: 'Gancho nos primeiros segundos' },
    { id: 'roteiro', label: 'Roteiro e duração conferidos' },
    { id: 'capa', label: 'Capa definida' },
    { id: 'legenda', label: 'Legenda e hashtags revisadas' },
  ],
  stories: [
    ...COMMON,
    { id: 'telas', label: 'Telas e ordem conferidas' },
    { id: 'link', label: 'Link ou enquete definidos, se houver' },
  ],
  story_sequence: [
    ...COMMON,
    { id: 'telas', label: 'Telas e ordem conferidas' },
    { id: 'link', label: 'Link ou enquete definidos, se houver' },
  ],
  video: [
    ...COMMON,
    { id: 'roteiro', label: 'Roteiro e duração conferidos' },
    { id: 'legendas', label: 'Legendas/closed captions revisadas' },
    { id: 'capa', label: 'Miniatura definida' },
  ],
  text: [...COMMON, { id: 'fontes', label: 'Fontes e dados verificados' }],
  institutional: [
    ...COMMON,
    { id: 'fontes', label: 'Fontes e dados verificados' },
    { id: 'aprovacao', label: 'Informações validadas com o cliente' },
  ],
  educational: [...COMMON, { id: 'fontes', label: 'Fontes e dados verificados' }],
  promotional: [
    ...COMMON,
    { id: 'regras', label: 'Regras da promoção e prazos conferidos' },
    { id: 'cta', label: 'Chamada para ação definida' },
  ],
  other: COMMON,
};

// --------------------------------------------------------------------- diff
export type DiffOp = { type: 'eq' | 'add' | 'del'; text: string };

const MAX_DIFF_TOKENS = 1500;

/** Diff por palavras (LCS). Textos muito longos caem para troca integral, para não travar o servidor. */
export function diffWords(a: string, b: string): DiffOp[] {
  if (a === b) return a ? [{ type: 'eq', text: a }] : [];
  const ta = a.match(/\s+|\S+/g) ?? [];
  const tb = b.match(/\s+|\S+/g) ?? [];
  if (ta.length > MAX_DIFF_TOKENS || tb.length > MAX_DIFF_TOKENS) {
    return [
      ...(a ? [{ type: 'del' as const, text: a }] : []),
      ...(b ? [{ type: 'add' as const, text: b }] : []),
    ];
  }
  const n = ta.length;
  const m = tb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        ta[i] === tb[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) {
      push('eq', ta[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push('del', ta[i++]!);
    else push('add', tb[j++]!);
  }
  while (i < n) push('del', ta[i++]!);
  while (j < m) push('add', tb[j++]!);
  return ops;
}

export interface FieldDiff {
  field: string;
  label: string;
  ops: DiffOp[];
}

export function diffBodies(a: EditorBody, b: EditorBody): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of TEXT_FIELDS)
    if (a[f] !== b[f]) out.push({ field: f, label: FIELD_LABELS[f], ops: diffWords(a[f], b[f]) });
  const sa = a.slides.map((s, i) => `${i + 1}. ${s.title}\n${s.text}`).join('\n\n');
  const sb = b.slides.map((s, i) => `${i + 1}. ${s.title}\n${s.text}`).join('\n\n');
  if (sa !== sb) out.push({ field: 'slides', label: FIELD_LABELS.slides, ops: diffWords(sa, sb) });
  return out;
}

export function bodiesEqual(a: EditorBody, b: EditorBody): boolean {
  return JSON.stringify(normalizeBody(a)) === JSON.stringify(normalizeBody(b));
}
