import { describe, expect, it } from 'vitest';
import {
  CHECKLISTS,
  EMPTY_BODY,
  bodiesEqual,
  charCount,
  diffBodies,
  diffWords,
  hashtagList,
  limitReports,
  missingForFormat,
  normalizeBody,
} from '@/modules/editor/rules';
import { NotConfiguredAiProvider, buildAiContext, getAiProvider } from '@/integrations/ai';
import { CONTENT_STATUS_LABELS, FORMAT_LABELS } from '@/modules/contents/rules';

const body = (over: Partial<typeof EMPTY_BODY> = {}) => normalizeBody({ ...EMPTY_BODY, ...over });

describe('normalização', () => {
  it('completa campos ausentes, ignora lixo e remove checklist duplicado', () => {
    const n = normalizeBody({
      caption: 'oi',
      slides: [{ title: 'a', text: 'b' }, null as never],
      checklist: ['x', 'x', 'y'],
    });
    expect(n.hook).toBe('');
    expect(n.slides).toEqual([
      { title: 'a', text: 'b' },
      { title: '', text: '' },
    ]);
    expect(n.checklist).toEqual(['x', 'y']);
    expect(normalizeBody(null)).toEqual(EMPTY_BODY);
  });
});

describe('limites por rede (avisos)', () => {
  it('conta caracteres como o usuário vê (emoji = 1)', () => {
    expect(charCount('olá 👩‍👩‍👧')).toBeGreaterThan(0);
    expect(charCount('😀😀')).toBe(2);
  });
  it('Instagram: legenda e hashtags acima do limite são sinalizadas; sem rede não há limite', () => {
    const r = limitReports('instagram', body({ caption: 'a'.repeat(2201) }));
    expect(r.find((x) => x.field === 'Legenda')).toMatchObject({ limit: 2200, over: true });
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ');
    expect(
      limitReports('instagram', body({ hashtags: tags })).find((x) => x.field === 'Hashtags')?.over,
    ).toBe(true);
    expect(limitReports(null, body({ caption: 'a'.repeat(99999) }))).toEqual([]);
    expect(limitReports('instagram', body({ caption: 'curta' })).every((x) => !x.over)).toBe(true);
  });
  it('lista hashtags únicas, com acentos', () => {
    expect(hashtagList('Oi #Café #café #promo_2031 sem#hash')).toEqual([
      '#café',
      '#promo_2031',
      '#hash',
    ]);
  });
});

describe('alertas e checklist por formato', () => {
  it('formatos exigem campos diferentes', () => {
    expect(missingForFormat('reels', body())).toEqual(['Gancho inicial', 'Roteiro', 'Legenda']);
    expect(missingForFormat('reels', body({ hook: 'x', script: 'y', caption: 'z' }))).toEqual([]);
    expect(
      missingForFormat('carousel', body({ caption: 'x', slides: [{ title: 'a', text: '' }] })),
    ).toEqual(['Pelo menos 2 slides']);
    expect(
      missingForFormat('static_post', body({ caption: 'x', productionNotes: 'arte azul' })),
    ).toEqual([]);
  });
  it('todo formato tem checklist com ids únicos', () => {
    for (const f of Object.keys(FORMAT_LABELS)) {
      const ids = CHECKLISTS[f as keyof typeof CHECKLISTS].map((i) => i.id);
      expect(ids.length).toBeGreaterThan(2);
      expect(new Set(ids).size).toBe(ids.length);
    }
    void CONTENT_STATUS_LABELS;
  });
});

describe('comparação de versões', () => {
  it('diff por palavras marca adições e remoções preservando o resto', () => {
    const ops = diffWords('Compre agora a coleção de verão', 'Compre hoje a nova coleção de verão');
    expect(ops.filter((o) => o.type === 'del').map((o) => o.text.trim())).toEqual(['agora']);
    expect(
      ops
        .filter((o) => o.type === 'add')
        .map((o) => o.text.trim())
        .join(' '),
    ).toContain('hoje');
    expect(ops.map((o) => (o.type === 'add' ? '' : o.text)).join('')).toBe(
      'Compre agora a coleção de verão',
    );
    expect(ops.map((o) => (o.type === 'del' ? '' : o.text)).join('')).toBe(
      'Compre hoje a nova coleção de verão',
    );
  });
  it('iguais não geram diferença; vazio vs texto é só adição', () => {
    expect(diffWords('igual', 'igual')).toEqual([{ type: 'eq', text: 'igual' }]);
    expect(diffWords('', 'novo texto')).toEqual([{ type: 'add', text: 'novo texto' }]);
    expect(diffWords('', '')).toEqual([]);
  });
  it('textos enormes não travam (troca integral)', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `p${i}`).join(' ');
    expect(diffWords(big, big + ' x').length).toBeLessThanOrEqual(2);
  });
  it('diffBodies lista só os campos alterados, incluindo slides', () => {
    const a = body({ caption: 'um', slides: [{ title: 'A', text: 'x' }] });
    const b = body({
      caption: 'dois',
      slides: [
        { title: 'A', text: 'x' },
        { title: 'B', text: 'y' },
      ],
    });
    expect(diffBodies(a, b).map((d) => d.field)).toEqual(['caption', 'slides']);
    expect(diffBodies(a, a)).toEqual([]);
    expect(bodiesEqual(a, normalizeBody(a))).toBe(true);
    expect(bodiesEqual(a, b)).toBe(false);
  });
});

describe('camada de IA (não configurada)', () => {
  it('não gera nada e informa que não está configurada', async () => {
    const p = getAiProvider();
    expect(p).toBeInstanceOf(NotConfiguredAiProvider);
    expect(p.configured).toBe(false);
    await expect(p.generate({ task: 'caption', context: {} as never })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
  it('o contexto enviado a um provedor é mínimo e truncado, sem notas internas', () => {
    const ctx = buildAiContext({
      client: {
        name: 'Cliente',
        toneOfVoice: 'x'.repeat(5000),
        audience: null,
        objectives: null,
        editorialGuidelines: 'g'.repeat(9000),
        forbiddenTopics: 'política',
        languageRestrictions: null,
        internalNotes: 'SEGREDO',
        email: 'a@b.c',
      } as never,
      brand: null,
      content: {
        title: 'T',
        format: 'reels',
        objective: null,
        audience: null,
        brief: 'b',
        network: 'instagram',
      },
      draft: { caption: 'oi' },
    });
    expect(ctx.client.tone!.length).toBeLessThanOrEqual(1500);
    expect(ctx.client.guidelines!.length).toBeLessThanOrEqual(3000);
    expect(JSON.stringify(ctx)).not.toContain('SEGREDO');
    expect(JSON.stringify(ctx)).not.toContain('a@b.c');
  });
});
