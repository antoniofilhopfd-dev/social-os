import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { can } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { listClients } from '@/modules/clients/service';
import { listCampaigns } from '@/modules/contents/campaigns';
import { listBrands } from '@/modules/clients/children';
import { listContents, listPillars } from '@/modules/contents/service';
import { cleanParams } from '@/modules/requests/schema';
import { contentFiltersSchema } from '@/modules/contents/schema';
import {
  CONTENT_STATUS_LABELS,
  FORMAT_LABELS,
  addDays,
  isoDate,
  monthRange,
  shiftMonth,
  weekDays,
} from '@/modules/contents/rules';
import { NETWORK_LABELS } from '@/modules/requests/labels';
import { Forbidden } from '@/ui/forbidden';
import { AgendaView, KanbanView, ListView, MonthView, Unscheduled, WeekView } from './views';

export const metadata: Metadata = { title: 'Conteúdos' };

const VIEWS = [
  ['calendario', 'Calendário'],
  ['semana', 'Semana'],
  ['agenda', 'Agenda'],
  ['lista', 'Lista'],
  ['kanban', 'Kanban'],
] as const;

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  if (!ctx.grants.some((g) => g.permissions.has('contents:view'))) return <Forbidden />;
  const parsed = contentFiltersSchema.safeParse(cleanParams(sp));
  const f = parsed.success ? parsed.data : {};
  const view = f.view ?? 'calendario';
  const now = new Date();
  const today = isoDate(now);
  const ym = f.mes ?? today.slice(0, 7);
  const day = f.dia ?? today;
  const db = getDb();

  let range: { from?: string; to?: string } = {};
  if (view === 'calendario' || view === 'agenda') range = monthRange(ym);
  if (view === 'semana') {
    const d = weekDays(day);
    range = { from: d[0], to: d[6] };
  }
  const ranged = view === 'calendario' || view === 'agenda' || view === 'semana';
  const base = { ...f, overdue: f.overdue === '1', includeArchived: f.archived === '1' };
  const [data, unscheduled, clients, pillars] = await Promise.all([
    listContents(
      db,
      ctx,
      { ...base, ...range, limit: ranged ? 500 : view === 'kanban' ? 300 : undefined },
      now,
    ),
    ranged
      ? listContents(db, ctx, { ...base, unscheduledOnly: true, limit: 50 }, now)
      : Promise.resolve({ items: [], nextBefore: null }),
    listClients(db, ctx),
    listPillars(db, ctx),
  ]);
  const brands = f.clientId ? await listBrands(db, ctx, f.clientId).catch(() => []) : [];
  const campaigns = f.clientId ? await listCampaigns(db, ctx, f.clientId).catch(() => []) : [];
  const internal = ctx.userKind === 'internal';
  const canCreate = internal && clients.some((c) => can(ctx, 'contents:create', c.id));
  const canEdit = internal && ctx.grants.some((g) => g.permissions.has('contents:edit'));

  const keep = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...cleanParams(sp), ...extra })) if (v) p.set(k, v);
    return `/conteudos?${p.toString()}`;
  };
  const prev =
    view === 'semana' ? keep({ dia: addDays(day, -7) }) : keep({ mes: shiftMonth(ym, -1) });
  const next =
    view === 'semana' ? keep({ dia: addDays(day, 7) }) : keep({ mes: shiftMonth(ym, 1) });
  const nowLink = view === 'semana' ? keep({ dia: today }) : keep({ mes: today.slice(0, 7) });

  return (
    <>
      <div className="page-head">
        <h1>Conteúdos</h1>
        {canCreate && (
          <Link href="/conteudos/novo" className="btn btn-primary">
            Novo conteúdo
          </Link>
        )}
      </div>

      <nav className="row" aria-label="Visões" style={{ marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <Link
            key={k}
            href={keep({ view: k })}
            className={`btn btn-sm ${view === k ? 'btn-primary' : 'btn-secondary'}`}
            aria-current={view === k ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>

      <form method="get" className="section form-row" aria-label="Filtros de conteúdos">
        <input type="hidden" name="view" value={view} />
        {ranged && view !== 'semana' && <input type="hidden" name="mes" value={ym} />}
        {view === 'semana' && <input type="hidden" name="dia" value={day} />}
        <div className="field">
          <label htmlFor="c-q">Buscar</label>
          <input
            id="c-q"
            name="q"
            className="input"
            defaultValue={f.q ?? ''}
            placeholder="Título, tema ou #número"
          />
        </div>
        {clients.length > 1 && (
          <div className="field">
            <label htmlFor="c-client">Cliente</label>
            <select id="c-client" name="clientId" className="input" defaultValue={f.clientId ?? ''}>
              <option value="">Todos</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {brands.length > 0 && (
          <div className="field">
            <label htmlFor="c-brand">Marca</label>
            <select id="c-brand" name="brandId" className="input" defaultValue={f.brandId ?? ''}>
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {campaigns.length > 0 && (
          <div className="field">
            <label htmlFor="c-camp">Campanha</label>
            <select
              id="c-camp"
              name="campaignId"
              className="input"
              defaultValue={f.campaignId ?? ''}
            >
              <option value="">Todas</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="c-net">Rede social</label>
          <select id="c-net" name="network" className="input" defaultValue={f.network ?? ''}>
            <option value="">Todas</option>
            {Object.entries(NETWORK_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-fmt">Formato</label>
          <select id="c-fmt" name="format" className="input" defaultValue={f.format ?? ''}>
            <option value="">Todos</option>
            {Object.entries(FORMAT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-status">Situação</label>
          <select id="c-status" name="status" className="input" defaultValue={f.status ?? ''}>
            <option value="">Todas</option>
            <option value="open">Em aberto</option>
            {Object.entries(CONTENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {pillars.length > 0 && (
          <div className="field">
            <label htmlFor="c-pillar">Pilar</label>
            <select id="c-pillar" name="pillarId" className="input" defaultValue={f.pillarId ?? ''}>
              <option value="">Todos</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {internal && (
          <div className="field">
            <label htmlFor="c-ass">Responsável</label>
            <select id="c-ass" name="assignee" className="input" defaultValue={f.assignee ?? ''}>
              <option value="">Todos</option>
              <option value="me">Atribuídos a mim</option>
              <option value="none">Sem responsável</option>
            </select>
          </div>
        )}
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="overdue"
            value="1"
            className="check"
            defaultChecked={f.overdue === '1'}
          />{' '}
          Somente atrasados
        </label>
        <label className="row" style={{ minHeight: 44 }}>
          <input
            type="checkbox"
            name="archived"
            value="1"
            className="check"
            defaultChecked={f.archived === '1'}
          />{' '}
          Incluir arquivados
        </label>
        <div>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
        </div>
      </form>

      {(view === 'calendario' || view === 'agenda' || view === 'semana') && (
        <div className="cal-nav" role="group" aria-label="Navegação de período">
          <Link href={prev} className="btn btn-secondary btn-sm">
            ← Anterior
          </Link>
          <Link href={nowLink} className="btn btn-secondary btn-sm">
            Hoje
          </Link>
          <Link href={next} className="btn btn-secondary btn-sm">
            Próximo →
          </Link>
          {view === 'semana' && (
            <strong>Semana de {weekDays(day)[0]!.split('-').reverse().join('/')}</strong>
          )}
        </div>
      )}

      {view === 'calendario' && (
        <MonthView ym={ym} items={data.items} today={today} canCreate={canCreate} />
      )}
      {view === 'semana' && (
        <WeekView day={day} items={data.items} today={today} canCreate={canCreate} />
      )}
      {view === 'agenda' && <AgendaView items={data.items} />}
      {view === 'lista' && <ListView items={data.items} />}
      {view === 'kanban' && <KanbanView items={data.items} canEdit={canEdit} />}
      {ranged && <Unscheduled items={unscheduled.items} />}
      {data.nextBefore && view === 'lista' && (
        <p>
          <Link href={keep({ before: data.nextBefore })}>Conteúdos mais antigos</Link>
        </p>
      )}
    </>
  );
}
