import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TYPES,
  DUPLICATE_THRESHOLD,
  TRANSITIONS,
  canTransition,
  missingFields,
  slaState,
  titleSimilarity,
  type RequestStatus,
} from '@/modules/requests/rules';

describe('transições de status', () => {
  it('só permite as transições declaradas', () => {
    expect(canTransition('new', 'in_triage')).toBe(true);
    expect(canTransition('new', 'accepted')).toBe(false); // não pula a triagem
    expect(canTransition('in_triage', 'accepted')).toBe(true);
    expect(canTransition('awaiting_info', 'accepted')).toBe(false);
    expect(canTransition('accepted', 'in_triage')).toBe(false);
    expect(canTransition('rejected', 'in_triage')).toBe(true); // reabrir
    expect(canTransition('cancelled', 'accepted')).toBe(false);
  });
  it('nenhum estado transita para si mesmo e todos os destinos existem', () => {
    for (const [from, tos] of Object.entries(TRANSITIONS) as [RequestStatus, RequestStatus[]][]) {
      expect(tos).not.toContain(from);
      for (const to of tos) expect(Object.keys(TRANSITIONS)).toContain(to);
    }
  });
});

describe('campos obrigatórios por tipo', () => {
  it('detecta ausentes (vazio, só espaços, nulo)', () => {
    expect(
      missingFields({ network: 'instagram', format: '  ', objective: null }, [
        'network',
        'format',
        'objective',
        'desiredDate',
      ]),
    ).toEqual(['format', 'objective', 'desiredDate']);
    expect(missingFields({ network: 'instagram' }, [])).toEqual([]);
  });
  it('tipos padrão só exigem campos configuráveis conhecidos', () => {
    for (const t of DEFAULT_TYPES)
      expect(missingFields({}, t.required).length).toBe(t.required.length);
  });
});

describe('prazos (SLA)', () => {
  const now = new Date('2030-06-10T12:00:00Z');
  const base = {
    status: 'new' as RequestStatus,
    firstResponseDueAt: null,
    firstResponseAt: null,
    estimatedDue: null,
  };
  it('resposta atrasada só para solicitação nova sem resposta', () => {
    expect(slaState({ ...base, firstResponseDueAt: new Date('2030-06-10T11:00:00Z') }, now)).toBe(
      'response_overdue',
    );
    expect(slaState({ ...base, firstResponseDueAt: new Date('2030-06-10T13:00:00Z') }, now)).toBe(
      'ok',
    );
    expect(
      slaState(
        {
          ...base,
          firstResponseDueAt: new Date('2030-06-10T11:00:00Z'),
          firstResponseAt: new Date(),
        },
        now,
      ),
    ).toBe('ok');
    expect(
      slaState(
        { ...base, status: 'in_triage', firstResponseDueAt: new Date('2030-06-10T11:00:00Z') },
        now,
      ),
    ).toBe('ok');
  });
  it('prazo estimado vencido apenas enquanto aberta', () => {
    expect(slaState({ ...base, status: 'in_triage', estimatedDue: '2030-06-09' }, now)).toBe(
      'due_overdue',
    );
    expect(slaState({ ...base, status: 'in_triage', estimatedDue: '2030-06-10' }, now)).toBe('ok');
    expect(slaState({ ...base, status: 'accepted', estimatedDue: '2030-06-01' }, now)).toBe('ok');
    expect(slaState({ ...base, status: 'rejected', estimatedDue: '2030-06-01' }, now)).toBe('ok');
  });
});

describe('detecção de duplicidade', () => {
  it('títulos praticamente iguais passam do limite; diferentes não', () => {
    expect(titleSimilarity('Post de Dia das Mães', 'post dia das maes!')).toBeGreaterThanOrEqual(
      DUPLICATE_THRESHOLD,
    );
    expect(
      titleSimilarity('Reels de lançamento da coleção', 'Reels lançamento coleção'),
    ).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
    expect(titleSimilarity('Post de Dia das Mães', 'Relatório mensal de resultados')).toBeLessThan(
      DUPLICATE_THRESHOLD,
    );
    expect(titleSimilarity('', 'qualquer')).toBe(0);
  });
  it('ignora acentos, maiúsculas e pontuação', () => {
    expect(titleSimilarity('Promoção de Verão', 'PROMOCAO verao')).toBe(1);
  });
});
