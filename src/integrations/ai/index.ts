import { AppError } from '@/core/errors';
import type { AiContext, AiProvider, AiRequest, AiResult } from './types';

export type { AiContext, AiProvider, AiRequest, AiResult, AiTask } from './types';

/** Provedor padrão: não configurado. Nunca devolve texto inventado. */
export class NotConfiguredAiProvider implements AiProvider {
  readonly id = 'none';
  readonly configured = false;
  async generate(_request: AiRequest): Promise<AiResult> {
    void _request;
    throw new AppError('CONFLICT', 'A integração com IA ainda não está configurada (Etapa 12).');
  }
}

let provider: AiProvider = new NotConfiguredAiProvider();
export const getAiProvider = (): AiProvider => provider;
/** Usado pela Etapa 12 e por testes para registrar um provedor. */
export const setAiProvider = (p: AiProvider) => {
  provider = p;
};

const cut = (v: string | null | undefined, n = 1500) => (v ? v.slice(0, n) : null);

/** Monta o contexto mínimo e autorizado enviado a um provedor (sem contatos, notas internas ou dados pessoais). */
export function buildAiContext(input: {
  client: {
    name: string;
    toneOfVoice: string | null;
    audience: string | null;
    objectives: string | null;
    editorialGuidelines: string | null;
    forbiddenTopics: string | null;
    languageRestrictions: string | null;
  };
  brand: {
    name: string;
    toneOfVoice: string | null;
    audience: string | null;
    editorialGuidelines: string | null;
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
}): AiContext {
  return {
    client: {
      name: input.client.name,
      tone: cut(input.client.toneOfVoice),
      audience: cut(input.client.audience),
      objectives: cut(input.client.objectives),
      guidelines: cut(input.client.editorialGuidelines, 3000),
      forbiddenTopics: cut(input.client.forbiddenTopics),
      languageRestrictions: cut(input.client.languageRestrictions),
    },
    brand: input.brand
      ? {
          name: input.brand.name,
          tone: cut(input.brand.toneOfVoice),
          audience: cut(input.brand.audience),
          guidelines: cut(input.brand.editorialGuidelines, 3000),
        }
      : null,
    content: {
      title: input.content.title,
      format: input.content.format,
      objective: cut(input.content.objective),
      audience: cut(input.content.audience, 500),
      brief: cut(input.content.brief, 3000),
      network: input.content.network,
    },
    draft: input.draft,
  };
}
