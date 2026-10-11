'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/ui/api-client';
import { Alert, Badge, Button } from '@/ui/components';

interface Row {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function SessionsClient({ sessions }: { sessions: Row[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function revoke(id: string) {
    setError(null);
    const r = await api('DELETE', `/api/me/sessions/${id}`);
    if (r.ok) router.refresh();
    else setError(r.error?.message ?? 'Não foi possível encerrar.');
  }
  async function revokeOthers() {
    setError(null);
    const r = await api<{ revoked: number }>('DELETE', '/api/me/sessions');
    if (r.ok) {
      setInfo(`${r.data?.revoked ?? 0} sessão(ões) encerrada(s).`);
      router.refresh();
    } else setError(r.error?.message ?? 'Não foi possível encerrar.');
  }

  return (
    <div className="stack">
      {error && <Alert tone="danger">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}
      <div className="table-wrap" role="region" aria-label="Sessões ativas" tabIndex={0}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Dispositivo</th>
              <th scope="col">Iniciada</th>
              <th scope="col">Última atividade</th>
              <th scope="col">
                <span className="sr-only">Ação</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.userAgent ?? 'Desconhecido'}{' '}
                  {s.current && <Badge tone="info">Esta sessão</Badge>}
                </td>
                <td>{fmt(s.createdAt)}</td>
                <td>{fmt(s.lastSeenAt)}</td>
                <td>
                  {!s.current && (
                    <Button variant="secondary" className="btn-sm" onClick={() => revoke(s.id)}>
                      Encerrar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sessions.length > 1 && (
        <div>
          <Button variant="secondary" onClick={revokeOthers}>
            Encerrar todas as outras sessões
          </Button>
        </div>
      )}
    </div>
  );
}
