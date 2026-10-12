import type { Metadata } from 'next';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { getEnv } from '@/core/env';
import { requireAuthPage } from '@/core/auth/server';
import { NETWORK_REQUIREMENTS } from '@/integrations/social/types';
import { getAiConnection } from '@/modules/integrations/service';
import { Badge } from '@/ui/components';
import { Forbidden } from '@/ui/forbidden';
import { AiConnection } from './ai-connection';

export const metadata: Metadata = { title: 'Integrações' };

export default async function IntegrationsPage() {
  const { ctx } = await requireAuthPage();
  if (ctx.userKind !== 'internal' || !canOrgWide(ctx, 'integrations:view')) return <Forbidden />;
  const ai = await getAiConnection(getDb(), ctx);
  return (
    <>
      <div className="page-head">
        <h1>Integrações</h1>
      </div>
      <AiConnection
        configured={ai.configured}
        status={ai.status}
        secretHint={ai.secretHint}
        model={ai.model}
        lastCheckedAt={ai.lastCheckedAt ? ai.lastCheckedAt.toISOString() : null}
        lastError={ai.lastError}
        canManage={ai.canManage}
        models={ai.models.map((m) => ({ id: m.id, label: m.label }))}
        serverReady={!!getEnv().APP_SECRET}
      />
      <section className="section stack" aria-labelledby="rs-h">
        <h2 id="rs-h">Redes sociais — publicação automática</h2>
        <p className="muted">
          Nenhuma rede está conectada. Cada plataforma exige um aplicativo próprio aprovado por ela
          e a autorização de cada cliente. Enquanto isso, a publicação é <strong>assistida</strong>:
          o sistema prepara o pacote e a equipe publica e registra o resultado.
        </p>
        <ul className="plain-list">
          {NETWORK_REQUIREMENTS.map((n) => (
            <li key={n.network}>
              <div className="row">
                <strong>{n.label}</strong>{' '}
                <Badge tone="warning">Pendente — depende da plataforma</Badge>
              </div>
              <ul>
                {n.needs.map((x) => (
                  <li key={x} className="muted">
                    {x}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
