import { describe, expect, it } from 'vitest';
import {
  CONTENT_STATUS_LABELS,
  MANUAL_TRANSITIONS,
  RESERVED_STATUSES,
  addDays,
  canTransitionManually,
  formatFromRequest,
  isValidDate,
  isValidMonth,
  monthGrid,
  monthRange,
  scheduleState,
  shiftMonth,
  weekDays,
  type ContentStatus,
} from '@/modules/contents/rules';

describe('estados e transições manuais', () => {
  it('estados reservados nunca podem ser atribuídos manualmente', () => {
    for (const from of Object.keys(CONTENT_STATUS_LABELS) as ContentStatus[]) {
      for (const to of RESERVED_STATUSES)
        expect(canTransitionManually(from, to), `${from} -> ${to}`).toBe(false);
    }
  });
  it('fluxo básico de produção', () => {
    expect(canTransitionManually('draft', 'in_production')).toBe(true);
    expect(canTransitionManually('in_production', 'internal_review')).toBe(true);
    expect(canTransitionManually('internal_review', 'in_production')).toBe(true);
    expect(canTransitionManually('draft', 'internal_review')).toBe(false); // não pula etapa
    expect(canTransitionManually('published', 'draft')).toBe(false);
    expect(canTransitionManually('published', 'cancelled')).toBe(false);
    expect(canTransitionManually('approved', 'cancelled')).toBe(true);
  });
  it('todos os destinos declarados existem', () => {
    for (const tos of Object.values(MANUAL_TRANSITIONS))
      for (const to of tos!) expect(Object.keys(CONTENT_STATUS_LABELS)).toContain(to);
  });
});

describe('datas e calendário', () => {
  it('valida datas reais', () => {
    expect(isValidDate('2031-02-28')).toBe(true);
    expect(isValidDate('2031-02-30')).toBe(false);
    expect(isValidDate('2031-13-01')).toBe(false);
    expect(isValidDate('1999-01-01')).toBe(false);
    expect(isValidDate("2031-01-01'; DROP")).toBe(false);
    expect(isValidMonth('2031-12')).toBe(true);
    expect(isValidMonth('2031-00')).toBe(false);
  });
  it('soma dias e meses cruzando limites', () => {
    expect(addDays('2031-02-27', 3)).toBe('2031-03-02');
    expect(addDays('2032-02-28', 1)).toBe('2032-02-29'); // bissexto
    expect(shiftMonth('2031-12', 1)).toBe('2032-01');
    expect(shiftMonth('2031-01', -1)).toBe('2030-12');
  });
  it('grade mensal: semanas de domingo a sábado cobrindo o mês inteiro', () => {
    const grid = monthGrid('2031-03'); // 01/03/2031 é sábado
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0]![0]!.date).toBe('2031-02-23'); // domingo anterior
    const inMonth = grid
      .flat()
      .filter((d) => d.inMonth)
      .map((d) => d.date);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0]).toBe('2031-03-01');
    expect(inMonth[30]).toBe('2031-03-31');
    expect(new Date(`${grid[0]![0]!.date}T00:00:00Z`).getUTCDay()).toBe(0);
    expect(grid.length).toBeGreaterThanOrEqual(5);
    expect(grid.length).toBeLessThanOrEqual(6);
  });
  it('fevereiro de 2032 (bissexto) tem 29 dias e a faixa cobre a grade', () => {
    expect(
      monthGrid('2032-02')
        .flat()
        .filter((d) => d.inMonth),
    ).toHaveLength(29);
    const r = monthRange('2032-02');
    expect(r.from <= '2032-02-01' && r.to >= '2032-02-29').toBe(true);
  });
  it('semana começa no domingo', () => {
    expect(weekDays('2031-03-12')).toEqual([
      '2031-03-09',
      '2031-03-10',
      '2031-03-11',
      '2031-03-12',
      '2031-03-13',
      '2031-03-14',
      '2031-03-15',
    ]);
  });
});

describe('atraso e proximidade', () => {
  const today = '2031-03-10';
  it('atrasado só se ainda aberto', () => {
    expect(scheduleState({ status: 'in_production', scheduledDate: '2031-03-09' }, today)).toBe(
      'overdue',
    );
    expect(scheduleState({ status: 'published', scheduledDate: '2031-03-01' }, today)).toBe('ok');
    expect(scheduleState({ status: 'cancelled', scheduledDate: '2031-03-01' }, today)).toBe('ok');
    expect(scheduleState({ status: 'draft', scheduledDate: null }, today)).toBe('ok');
  });
  it('próximo: até 2 dias e ainda em rascunho/produção', () => {
    expect(scheduleState({ status: 'draft', scheduledDate: '2031-03-12' }, today)).toBe('due_soon');
    expect(scheduleState({ status: 'in_production', scheduledDate: '2031-03-10' }, today)).toBe(
      'due_soon',
    );
    expect(scheduleState({ status: 'internal_review', scheduledDate: '2031-03-12' }, today)).toBe(
      'ok',
    );
    expect(scheduleState({ status: 'draft', scheduledDate: '2031-03-13' }, today)).toBe('ok');
  });
});

describe('formato vindo de solicitação', () => {
  it.each([
    ['Carrossel', 'carousel'],
    ['REELS', 'reels'],
    ['Sequência de Stories', 'story_sequence'],
    ['Stories', 'stories'],
    ['Vídeo curto', 'video'],
    ['Post estático', 'static_post'],
    ['', 'other'],
    [null, 'other'],
  ])('%s -> %s', (t, f) => {
    expect(formatFromRequest(t as string | null)).toBe(f);
  });
});
