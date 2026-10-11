import Link from 'next/link';
import {
  CONTENT_STATUS_LABELS,
  FORMAT_LABELS,
  KANBAN_COLUMNS,
  MANUAL_TRANSITIONS,
  MONTH_NAMES,
  RESERVED_STATUSES,
  WEEKDAY_SHORT,
  monthGrid,
  monthTitle,
  weekDays,
  type ContentStatus,
} from '@/modules/contents/rules';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { Badge } from '@/ui/components';
import { EmptyState } from '@/ui/states';
import { KanbanMove } from './kanban-move';

export interface Item {
  id: string;
  number: number;
  title: string;
  format: keyof typeof FORMAT_LABELS;
  status: ContentStatus;
  priority: string;
  clientId: string;
  clientName: string;
  brandName: string | null;
  network: string | null;
  profileHandle: string | null;
  pillarName: string | null;
  pillarColor: string | null;
  assigneeName: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  schedule: 'ok' | 'overdue' | 'due_soon';
}

const dm = (d: string) => d.split('-').reverse().join('/');
const dayNum = (d: string) => Number(d.slice(8));

function Chip({ c }: { c: Item }) {
  const cls = `chip pillar-${c.pillarColor ?? 'blue'} ${c.schedule === 'overdue' ? 'late' : c.schedule === 'due_soon' ? 'soon' : ''}`;
  return (
    <Link href={`/conteudos/${c.id}`} className={cls} title={`${c.title} · ${c.clientName}`}>
      {c.scheduledTime && <>{c.scheduledTime} · </>}
      {c.title}
      <small>
        {c.clientName} · {CONTENT_STATUS_LABELS[c.status]}
        {c.schedule === 'overdue' ? ' · ATRASADO' : ''}
      </small>
    </Link>
  );
}

function byDate(items: Item[]) {
  const map = new Map<string, Item[]>();
  for (const i of items)
    if (i.scheduledDate) map.set(i.scheduledDate, [...(map.get(i.scheduledDate) ?? []), i]);
  return map;
}

export function Unscheduled({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section className="section" aria-labelledby="sem-data">
      <h2 id="sem-data">Sem data definida ({items.length})</h2>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((c) => (
          <li key={c.id}>
            <Chip c={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MonthView({
  ym,
  items,
  today,
  canCreate,
}: {
  ym: string;
  items: Item[];
  today: string;
  canCreate: boolean;
}) {
  const grid = monthGrid(ym);
  const map = byDate(items);
  return (
    <div className="table-wrap" style={{ border: 0 }}>
      <table className="cal">
        <caption>{monthTitle(ym).replace(/^./, (c) => c.toUpperCase())}</caption>
        <thead>
          <tr>
            {WEEKDAY_SHORT.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr key={week[0]!.date}>
              {week.map(({ date, inMonth }) => {
                const list = map.get(date) ?? [];
                return (
                  <td
                    key={date}
                    className={`${inMonth ? '' : 'out'} ${date === today ? 'today' : ''} ${list.length === 0 ? 'empty' : ''}`}
                    aria-label={`${dm(date)}${list.length ? `, ${list.length} conteúdo(s)` : ''}`}
                  >
                    <div className="day-head">
                      <span>
                        {dayNum(date)}
                        <span className="dow">
                          {WEEKDAY_SHORT[new Date(`${date}T00:00:00Z`).getUTCDay()]} {dm(date)}
                        </span>
                      </span>
                      {canCreate && inMonth && (
                        <Link
                          href={`/conteudos/novo?data=${date}`}
                          className="day-add"
                          aria-label={`Novo conteúdo em ${dm(date)}`}
                        >
                          +
                        </Link>
                      )}
                    </div>
                    {list.length > 0 && (
                      <ul>
                        {list.map((c) => (
                          <li key={c.id}>
                            <Chip c={c} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function WeekView({
  day,
  items,
  today,
  canCreate,
}: {
  day: string;
  items: Item[];
  today: string;
  canCreate: boolean;
}) {
  const days = weekDays(day);
  const map = byDate(items);
  return (
    <div className="week">
      {days.map((d, i) => (
        <section
          key={d}
          className={`week-col ${d === today ? 'today' : ''}`}
          aria-label={`${WEEKDAY_SHORT[i]} ${dm(d)}`}
        >
          <h3>
            {WEEKDAY_SHORT[i]} {dm(d)}
          </h3>
          {canCreate && (
            <Link
              href={`/conteudos/novo?data=${d}`}
              className="day-add"
              aria-label={`Novo conteúdo em ${dm(d)}`}
            >
              +
            </Link>
          )}
          {(map.get(d) ?? []).length > 0 ? (
            <ul>
              {(map.get(d) ?? []).map((c) => (
                <li key={c.id}>
                  <Chip c={c} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: '0.8125rem' }}>
              Nada previsto.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}

export function AgendaView({ items }: { items: Item[] }) {
  const map = byDate(items);
  const days = [...map.keys()].sort();
  if (days.length === 0)
    return (
      <EmptyState title="Nada agendado no período" description="Ajuste o mês ou os filtros." />
    );
  return (
    <div>
      {days.map((d) => {
        const dt = new Date(`${d}T00:00:00Z`);
        return (
          <section key={d} className="agenda-day section" aria-labelledby={`ag-${d}`}>
            <h3 id={`ag-${d}`}>
              {WEEKDAY_SHORT[dt.getUTCDay()]}, {dayNum(d)} de {MONTH_NAMES[dt.getUTCMonth()]}
            </h3>
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {map.get(d)!.map((c) => (
                <li key={c.id}>
                  <Chip c={c} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ListView({ items }: { items: Item[] }) {
  if (items.length === 0)
    return (
      <EmptyState
        title="Nenhum conteúdo encontrado"
        description="Ajuste os filtros ou crie um novo conteúdo."
      />
    );
  return (
    <div className="table-wrap" role="region" aria-label="Lista de conteúdos" tabIndex={0}>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Nº</th>
            <th scope="col">Conteúdo</th>
            <th scope="col">Situação</th>
            <th scope="col" className="hide-mobile">
              Formato
            </th>
            <th scope="col" className="hide-mobile">
              Rede
            </th>
            <th scope="col" className="hide-mobile">
              Responsável
            </th>
            <th scope="col" className="hide-mobile">
              Data
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>#{c.number}</td>
              <td>
                <Link href={`/conteudos/${c.id}`}>{c.title}</Link>
                <br />
                <span className="muted">
                  {c.clientName}
                  {c.pillarName ? ` · ${c.pillarName}` : ''}
                </span>
              </td>
              <td>
                <Badge
                  tone={
                    c.status === 'published' || c.status === 'approved'
                      ? 'success'
                      : c.status === 'changes_requested'
                        ? 'danger'
                        : c.status === 'draft' ||
                            c.status === 'cancelled' ||
                            c.status === 'archived'
                          ? 'neutral'
                          : 'info'
                  }
                >
                  {CONTENT_STATUS_LABELS[c.status]}
                </Badge>
                {c.schedule === 'overdue' && (
                  <>
                    <br />
                    <Badge tone="danger">Atrasado</Badge>
                  </>
                )}
                {c.schedule === 'due_soon' && (
                  <>
                    <br />
                    <Badge tone="warning">Publicação próxima</Badge>
                  </>
                )}
              </td>
              <td className="hide-mobile">{FORMAT_LABELS[c.format]}</td>
              <td className="hide-mobile">{c.network ? NETWORK_LABELS[c.network] : '—'}</td>
              <td className="hide-mobile">{c.assigneeName ?? '—'}</td>
              <td className="hide-mobile">
                {c.scheduledDate
                  ? `${dm(c.scheduledDate)}${c.scheduledTime ? ` ${c.scheduledTime}` : ''}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function KanbanView({ items, canEdit }: { items: Item[]; canEdit: boolean }) {
  const columns = KANBAN_COLUMNS.filter(
    (s) => items.some((i) => i.status === s) || !RESERVED_STATUSES.includes(s) || true,
  );
  return (
    <div className="kanban" role="region" aria-label="Quadro Kanban" tabIndex={0}>
      {columns.map((status) => {
        const col = items.filter((i) => i.status === status);
        return (
          <section key={status} className="kcol" aria-labelledby={`k-${status}`}>
            <h3 id={`k-${status}`}>
              <span>{CONTENT_STATUS_LABELS[status]}</span>
              <Badge>{col.length}</Badge>
            </h3>
            {RESERVED_STATUSES.includes(status) && (
              <p className="field-hint">
                Controlado pelo fluxo de{' '}
                {status === 'scheduled' || status === 'published'
                  ? 'publicação (Etapa 09)'
                  : 'aprovação (Etapa 08)'}
                .
              </p>
            )}
            {col.map((c) => (
              <article key={c.id} className="kcard">
                <Link href={`/conteudos/${c.id}`}>
                  #{c.number} · {c.title}
                </Link>
                <span className="muted">
                  {c.clientName} · {FORMAT_LABELS[c.format]}
                </span>
                {c.scheduledDate && (
                  <span className={c.schedule === 'overdue' ? 'field-error' : 'muted'}>
                    {dm(c.scheduledDate)}
                    {c.scheduledTime ? ` ${c.scheduledTime}` : ''}
                    {c.schedule === 'overdue' ? ' · atrasado' : ''}
                  </span>
                )}
                {c.assigneeName && <span className="muted">{c.assigneeName}</span>}
                {canEdit && (MANUAL_TRANSITIONS[c.status] ?? []).length > 0 && (
                  <KanbanMove
                    id={c.id}
                    title={c.title}
                    status={c.status}
                    targets={MANUAL_TRANSITIONS[c.status] ?? []}
                  />
                )}
              </article>
            ))}
            {col.length === 0 && (
              <p className="muted" style={{ fontSize: '0.8125rem' }}>
                Nenhum conteúdo.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
