import { describe, expect, it } from 'vitest';
import { dueState, progress, projectProgress } from '@/modules/tasks/rules';

describe('prazos de tarefas', () => {
  const today = '2031-03-12';
  it('atrasada, hoje, em breve, ok e sem prazo', () => {
    expect(dueState('todo', '2031-03-11', today)).toBe('overdue');
    expect(dueState('in_progress', '2031-03-12', today)).toBe('today');
    expect(dueState('todo', '2031-03-14', today)).toBe('soon');
    expect(dueState('todo', '2031-03-15', today)).toBe('ok');
    expect(dueState('todo', null, today)).toBe('none');
  });
  it('tarefas encerradas nunca ficam atrasadas', () => {
    expect(dueState('done', '2020-01-01', today)).toBe('none');
    expect(dueState('cancelled', '2020-01-01', today)).toBe('none');
  });
  it('progresso', () => {
    expect(progress(0, 0)).toBe(0);
    expect(progress(1, 3)).toBe(33);
    expect(projectProgress({ done: 3, open: 1 })).toBe(75);
  });
});
