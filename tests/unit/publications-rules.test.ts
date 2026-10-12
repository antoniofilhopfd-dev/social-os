import { describe, expect, it } from 'vitest';
import { buildPostText, parsePostUrl, queueState } from '@/modules/publications/rules';
import { normalizeBody } from '@/modules/editor/rules';
import { nowTimeLocal, todayLocal } from '@/core/time';

describe('fila de publicação', () => {
  const p = (d: string, t: string | null, status = 'scheduled' as const) => ({
    status,
    scheduledDate: d,
    scheduledTime: t,
  });
  it('atrasada, hoje e futura', () => {
    expect(queueState(p('2031-03-11', null), '2031-03-12', '10:00')).toBe('overdue');
    expect(queueState(p('2031-03-12', '09:00'), '2031-03-12', '10:00')).toBe('overdue');
    expect(queueState(p('2031-03-12', '11:00'), '2031-03-12', '10:00')).toBe('today');
    expect(queueState(p('2031-03-12', null), '2031-03-12', '23:00')).toBe('today');
    expect(queueState(p('2031-03-13', '08:00'), '2031-03-12', '10:00')).toBe('upcoming');
    expect(queueState(p('2020-01-01', null, 'published' as never), '2031-03-12', '10:00')).toBe(
      'none',
    );
  });
});

describe('link da publicação', () => {
  it('aceita http(s) e recusa o resto', () => {
    expect(parsePostUrl('https://www.instagram.com/p/abc123/')).toBe(
      'https://www.instagram.com/p/abc123/',
    );
    expect(parsePostUrl('javascript:alert(1)')).toBeNull();
    expect(parsePostUrl('data:text/html,<script>')).toBeNull();
    expect(parsePostUrl('ftp://x.com/a')).toBeNull();
    expect(parsePostUrl('https://user:senha@site.com/')).toBeNull();
    expect(parsePostUrl('https://localhost/x')).toBeNull();
    expect(parsePostUrl('x'.repeat(501))).toBeNull();
    expect(parsePostUrl('   ')).toBeNull();
  });
});

describe('texto final', () => {
  it('junta legenda, CTA e hashtags sem repetir', () => {
    expect(buildPostText(normalizeBody({ caption: 'Oi', cta: 'Compre', hashtags: '#a #b' }))).toBe(
      'Oi\n\nCompre\n\n#a #b',
    );
    expect(buildPostText(normalizeBody({ caption: 'Oi #a #b', hashtags: '#a #b' }))).toBe(
      'Oi #a #b',
    );
  });
});

describe('fuso horário', () => {
  it('usa horário de Brasília, não UTC', () => {
    const d = new Date('2031-03-12T01:30:00Z'); // 22:30 do dia 11 em Brasília
    expect(todayLocal(d, 'America/Sao_Paulo')).toBe('2031-03-11');
    expect(nowTimeLocal(d, 'America/Sao_Paulo')).toBe('22:30');
  });
});
