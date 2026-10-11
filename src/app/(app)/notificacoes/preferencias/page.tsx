import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { requireAuthPage } from '@/core/auth/server';
import { getPreferences } from '@/modules/notifications/service';
import { NOTIFICATION_TYPES, type NotificationType } from '@/modules/notifications/types';
import { PreferencesClient } from './preferences-client';

export const metadata: Metadata = { title: 'Preferências de notificação' };

export default async function PreferencesPage() {
  const { ctx } = await requireAuthPage();
  const prefs = await getPreferences(getDb(), ctx);
  return (
    <>
      <div className="page-head">
        <h1>Preferências de notificação</h1>
        <Link href="/notificacoes">Voltar às notificações</Link>
      </div>
      <p className="muted">
        Escolha quais avisos internos você quer receber. Notificações por e-mail não estão
        disponíveis nesta fase.
      </p>
      <PreferencesClient
        items={prefs.map((p) => ({
          ...p,
          label: NOTIFICATION_TYPES[p.type as NotificationType].label,
          description: NOTIFICATION_TYPES[p.type as NotificationType].description,
        }))}
      />
    </>
  );
}
