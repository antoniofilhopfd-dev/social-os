import type { PROJECT_STATUSES, TASK_STATUSES } from '@/db/schema';

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  in_review: 'Em revisão',
  done: 'Concluída',
  cancelled: 'Cancelada',
};
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planejamento',
  active: 'Em andamento',
  on_hold: 'Em espera',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};
export const OPEN_TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'in_review'];
export const CLOSED_TASK_STATUSES: TaskStatus[] = ['done', 'cancelled'];
export const KANBAN_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'in_review', 'done'];
export const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export type DueState = 'overdue' | 'today' | 'soon' | 'ok' | 'none';

/** Situação do prazo; tarefas encerradas não ficam atrasadas. `today` em AAAA-MM-DD. */
export function dueState(
  status: TaskStatus,
  dueDate: string | null,
  today: string,
  soonDays = 2,
): DueState {
  if (!dueDate || CLOSED_TASK_STATUSES.includes(status)) return 'none';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + soonDays);
  return dueDate <= limit.toISOString().slice(0, 10) ? 'soon' : 'ok';
}

/** Progresso de itens de checklist (0–100). */
export function progress(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

/** Estados de um projeto a partir das suas tarefas (informativo). */
export function projectProgress(counts: { done: number; open: number }): number {
  const total = counts.done + counts.open;
  return total === 0 ? 0 : Math.round((counts.done / total) * 100);
}
