'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button } from '@/ui/components';
import { EmptyState } from '@/ui/states';

interface Item {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationsClient({
  items,
  unread,
  unreadOnly,
  nextHref,
}: {
  items: Item[];
  unread: number;
  unreadOnly: boolean;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    const r = await fn();
    if (r.ok) {
      setError(null);
      router.refresh();
    } else setError(r.error?.message ?? 'Erro.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {unread > 0 && (
        <div>
          <Button
            variant="secondary"
            className="btn-sm"
            onClick={() => run(() => api('POST', '/api/notifications/read-all'))}
          >
            Marcar todas como lidas
          </Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'Nenhuma notificação não lida' : 'Nenhuma notificação ainda'}
          description="Avisos sobre convites, mudanças de função e outras ações relevantes aparecem aqui."
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Lista de notificações" tabIndex={0}>
          {items.map((n) => (
            <article key={n.id} className={`notif ${n.read ? '' : 'unread'}`}>
              <div>
                <strong>{n.title}</strong> {!n.read && <Badge tone="info">Nova</Badge>}
                {n.body && <div className="muted">{n.body}</div>}
                <div className="field-hint">
                  {new Date(n.createdAt).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                  {n.link && (
                    <>
                      {' '}
                      · <Link href={n.link}>Abrir</Link>
                    </>
                  )}
                </div>
              </div>
              {!n.read && (
                <Button
                  variant="secondary"
                  className="btn-sm"
                  onClick={() => run(() => api('POST', `/api/notifications/${n.id}/read`))}
                >
                  Marcar como lida
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
      {nextHref && (
        <p>
          <Link href={nextHref}>Notificações mais antigas</Link>
        </p>
      )}
    </div>
  );
}
