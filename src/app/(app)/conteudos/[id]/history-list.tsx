import { CONTENT_STATUS_LABELS, type ContentStatus } from '@/modules/contents/rules';
import { EmptyState } from '@/ui/states';

const LABELS: Record<string, string> = {
  'content.created': 'Conteúdo criado',
  'content.updated': 'Dados alterados',
  'content.status_changed': 'Situação alterada',
  'content.duplicated': 'Criado por duplicação',
  'content.deleted': 'Conteúdo excluído',
};
const FIELDS: Record<string, string> = {
  title: 'Título',
  format: 'Formato',
  brandId: 'Marca',
  socialProfileId: 'Perfil',
  pillarId: 'Pilar',
  campaignId: 'Campanha',
  theme: 'Tema',
  objective: 'Objetivo',
  audience: 'Público',
  brief: 'Briefing',
  scheduledDate: 'Data',
  scheduledTime: 'Horário',
  assigneeUserId: 'Responsável',
  priority: 'Prioridade',
};

interface Item {
  id: string;
  action: string;
  actor: string | null;
  at: string;
  metadata: Record<string, unknown> | null;
}

export function HistoryList({ items }: { items: Item[] }) {
  if (items.length === 0) return <EmptyState title="Sem histórico" />;
  return (
    <div className="table-wrap" role="region" aria-label="Histórico do conteúdo" tabIndex={0}>
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Quando</th>
            <th scope="col">Quem</th>
            <th scope="col">O que mudou</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h) => {
            const m = h.metadata ?? {};
            const changes = m.changes as Record<string, { from: unknown; to: unknown }> | undefined;
            return (
              <tr key={h.id}>
                <td>
                  {new Date(h.at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td>{h.actor ?? 'Sistema'}</td>
                <td>
                  <strong>{LABELS[h.action] ?? h.action}</strong>
                  {h.action === 'content.status_changed' && (
                    <div className="muted">
                      {CONTENT_STATUS_LABELS[m.from as ContentStatus]} →{' '}
                      {CONTENT_STATUS_LABELS[m.to as ContentStatus]}
                      {m.message ? ` · ${String(m.message)}` : ''}
                    </div>
                  )}
                  {changes && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {Object.entries(changes).map(([k, v]) => (
                        <li key={k}>
                          <em>{FIELDS[k] ?? k}</em>: {String(v.from ?? '—')} → {String(v.to ?? '—')}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
