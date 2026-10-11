import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/db';
import { canOrgWide } from '@/core/auth/context';
import { requireAuthPage } from '@/core/auth/server';
import { isId } from '@/core/ids';
import { listAudit } from '@/modules/audit/service';
import { Forbidden } from '@/ui/forbidden';
import { EmptyState } from '@/ui/states';

export const metadata: Metadata = { title: 'Auditoria' };

const LABELS: Record<string, string> = {
  'auth.login': 'Login',
  'auth.login_failed': 'Falha de login',
  'auth.logout': 'Logout',
  'auth.password_reset_completed': 'Senha redefinida',
  'user.password_reset_issued': 'Link de senha gerado',
  'invitation.created': 'Convite criado',
  'invitation.accepted': 'Convite aceito',
  'invitation.revoked': 'Convite revogado',
  'membership.role_changed': 'Função alterada',
  'membership.removed': 'Vínculo removido',
  'role.created': 'Função criada',
  'role.updated': 'Função alterada',
  'role.deleted': 'Função excluída',
  'session.revoked': 'Sessão encerrada',
  'session.revoked_others': 'Outras sessões encerradas',
  'client.created': 'Cliente criado',
  'client.updated': 'Cliente alterado',
  'client.deleted': 'Cliente excluído',
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string; action?: string }>;
}) {
  const { ctx } = await requireAuthPage();
  if (!canOrgWide(ctx, 'audit:view')) return <Forbidden />;
  const sp = await searchParams;
  const action = sp.action && LABELS[sp.action] ? sp.action : undefined;
  const { items, nextBefore } = await listAudit(getDb(), ctx, {
    before: isId(sp.before) ? sp.before : undefined,
    action,
  });
  return (
    <>
      <div className="page-head">
        <h1>Auditoria</h1>
      </div>
      <form method="get" className="section form-row">
        <div className="field">
          <label htmlFor="f-action">Tipo de evento</label>
          <select id="f-action" name="action" className="input" defaultValue={action ?? ''}>
            <option value="">Todos</option>
            {Object.entries(LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button type="submit" className="btn btn-secondary">
            Filtrar
          </button>
        </div>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum evento encontrado"
          description="Os eventos relevantes da organização aparecem aqui."
        />
      ) : (
        <div className="table-wrap" role="region" aria-label="Eventos de auditoria" tabIndex={0}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">Evento</th>
                <th scope="col" className="hide-mobile">
                  Detalhes
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.createdAt.toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </td>
                  <td>{i.actorName ?? 'Sistema/Desconhecido'}</td>
                  <td>{LABELS[i.action] ?? i.action}</td>
                  <td className="hide-mobile muted">
                    {i.metadata ? JSON.stringify(i.metadata) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nextBefore && (
        <p>
          <Link href={`/auditoria?before=${nextBefore}${action ? `&action=${action}` : ''}`}>
            Eventos mais antigos
          </Link>
        </p>
      )}
    </>
  );
}
