import type { Metadata } from 'next';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { mySessions } from '@/modules/auth/service';
import { SessionsClient } from './sessions-client';

export const metadata: Metadata = { title: 'Minhas sessões' };

export default async function SessionsPage() {
  const { ctx } = await requireAuthPage();
  const sessions = await mySessions(getDb(), ctx);
  return (
    <>
      <div className="page-head">
        <h1>Minhas sessões</h1>
      </div>
      <p className="muted">
        Dispositivos com acesso à sua conta. Encerre os que você não reconhece.
      </p>
      <SessionsClient
        sessions={sessions.map((s) => ({
          id: s.id,
          current: s.current,
          userAgent: s.userAgent,
          createdAt: s.createdAt.toISOString(),
          lastSeenAt: s.lastSeenAt.toISOString(),
        }))}
      />
    </>
  );
}
