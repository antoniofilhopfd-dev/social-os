import { describe, expect, it } from 'vitest';
import { engagementRate, interactions, sumKnown, toCsv } from '@/modules/metrics/rules';
import { startOfLocalDay, startOfNextLocalDay } from '@/core/time';

describe('métricas', () => {
  it('interações e taxa: nulo não é zero', () => {
    expect(interactions({})).toBeNull();
    expect(interactions({ likes: 10, saves: 5 })).toBe(15);
    expect(engagementRate({ likes: 10, comments: 5, reach: 300 })).toBe(5);
    expect(engagementRate({ likes: 10 })).toBeNull(); // sem alcance
    expect(engagementRate({ reach: 100 })).toBeNull(); // sem interações
    expect(engagementRate({ likes: 0, reach: 100 })).toBe(0);
  });
  it('soma ignora não informados e devolve nulo se nenhum', () => {
    expect(sumKnown([1, null, 2, undefined])).toBe(3);
    expect(sumKnown([null, undefined])).toBeNull();
    expect(sumKnown([0, 0])).toBe(0);
  });
});

describe('csv', () => {
  it('escapa, usa ; e BOM e neutraliza fórmulas', () => {
    const csv = toCsv(
      ['A', 'B'],
      [
        ['=SOMA(1;2)', 'a;"b"'],
        ['+cmd', null],
        ['normal', 3],
      ],
    );
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain("'=SOMA(1;2)");
    expect(csv).toContain('"a;""b"""');
    expect(csv).toContain("'+cmd;");
    expect(csv).toContain('normal;3');
  });
});

describe('limites do período no fuso local', () => {
  it('dia local de Brasília começa às 03:00 UTC', () => {
    expect(startOfLocalDay('2031-03-12', 'America/Sao_Paulo').toISOString()).toBe(
      '2031-03-12T03:00:00.000Z',
    );
    expect(startOfNextLocalDay('2031-03-12', 'America/Sao_Paulo').toISOString()).toBe(
      '2031-03-13T03:00:00.000Z',
    );
    expect(startOfLocalDay('2031-03-12', 'UTC').toISOString()).toBe('2031-03-12T00:00:00.000Z');
  });
});
