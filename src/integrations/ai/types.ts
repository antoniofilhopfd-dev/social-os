/**
 * Camada de IA substituível (Etapa 12 conecta um provedor real). Hoje não existe provedor configurado:
 * NADA é gerado e nenhuma chamada externa é feita. As regras abaixo valem para qualquer provedor futuro.
 *
 * - O resultado é SEMPRE uma sugestão editável; nunca é salvo, aprovado ou publicado automaticamente.
 * - O conteúdo gerado é marcado `source: 'ai_assisted'` nas versões.
 * - Sugestões não são fatos: o provedor deve devolver `notes` indicando o que precisa de verificação.
 * - O contexto enviado ao provedor passa por `buildAiContext` (apenas dados autorizados e mínimos).
 */
export type AiTask =
  | 'ideas'
  | 'caption'
  | 'tone_variations'
  | 'reels_script'
  | 'carousel_structure'
  | 'cta'
  | 'proofread'
  | 'clarity'
  | 'adapt_for_network'
  | 'brief_summary'
  | 'titles'
  | 'hashtags'
  | 'alt_text';

export interface AiContext {
  client: {
    name: string;
    tone: string | null;
    audience: string | null;
    objectives: string | null;
    guidelines: string | null;
    forbiddenTopics: string | null;
    languageRestrictions: string | null;
  };
  brand: {
    name: string;
    tone: string | null;
    audience: string | null;
    guidelines: string | null;
  } | null;
  content: {
    title: string;
    format: string;
    objective: string | null;
    audience: string | null;
    brief: string | null;
    network: string | null;
  };
  draft: Record<string, unknown>;
}

export interface AiRequest {
  task: AiTask;
  context: AiContext;
  instruction?: string;
}
export interface AiResult {
  /** Opções de texto, já separadas. Sempre sugestões para revisão humana. */
  options: string[];
  /** Itens que exigem verificação humana (fatos, números, promessas). */
  notes: string[];
  provider: string;
  model?: string;
  usage?: { inputTokens: number | null; outputTokens: number | null };
}

export interface AiProvider {
  readonly id: string;
  readonly configured: boolean;
  generate(request: AiRequest): Promise<AiResult>;
}
