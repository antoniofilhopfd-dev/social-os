import { describe, expect, it } from 'vitest';
import { clientView, hasReviewableContent } from '@/modules/approvals/rules';
import { normalizeBody } from '@/modules/editor/rules';

describe('regras de aprovação', () => {
  it('cliente nunca recebe observações internas', () => {
    const body = normalizeBody({
      caption: 'Legenda',
      productionNotes: 'SEGREDO interno',
      publishNotes: 'SEGREDO publicação',
      references: 'SEGREDO fonte',
      checklist: ['ortografia'],
    });
    const v = clientView(body);
    expect(JSON.stringify(v)).not.toContain('SEGREDO');
    expect(v).not.toHaveProperty('checklist');
    expect(v.caption).toBe('Legenda');
  });
  it('exige algo para o cliente avaliar', () => {
    expect(hasReviewableContent(normalizeBody({}))).toBe(false);
    expect(hasReviewableContent(normalizeBody({ productionNotes: 'só interno' }))).toBe(false);
    expect(hasReviewableContent(normalizeBody({ caption: 'x' }))).toBe(true);
    expect(hasReviewableContent(normalizeBody({ slides: [{ title: 'a', text: '' }] }))).toBe(true);
  });
});
