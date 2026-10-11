import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listNotifications } from '@/modules/notifications/service';
import { NotificationsClient } from './notifications-client';

export const metadata: Metadata = { title: 'Notificações' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; before?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireAuthPage();
  const unreadOnly = sp.filtro === 'nao-lidas';
  const data = await listNotifications(getDb(), ctx, {
    unreadOnly,
    before: isId(sp.before) ? sp.before : undefined,
  });
  return (
    <>
      <div className="page-head">
        <h1>Notificações</h1>
        <Link href="/notificacoes/preferencias">Preferências</Link>
      </div>
      <nav className="row" aria-label="Filtro de notificações" style={{ marginBottom: 12 }}>
        <Link
          className={`btn btn-sm ${unreadOnly ? 'btn-secondary' : 'btn-primary'}`}
          href="/notificacoes"
          aria-current={!unreadOnly ? 'page' : undefined}
        >
          Todas
        </Link>
        <Link
          className={`btn btn-sm ${unreadOnly ? 'btn-primary' : 'btn-secondary'}`}
          href="/notificacoes?filtro=nao-lidas"
          aria-current={unreadOnly ? 'page' : undefined}
        >
          Não lidas ({data.unread})
        </Link>
      </nav>
      <NotificationsClient
        items={data.items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))}
        unread={data.unread}
        unreadOnly={unreadOnly}
        nextHref={
          data.nextBefore
            ? `/notificacoes?${unreadOnly ? 'filtro=nao-lidas&' : ''}before=${data.nextBefore}`
            : null
        }
      />
    </>
  );
}
