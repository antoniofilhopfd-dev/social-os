import { EmptyState } from '@/ui/states';

const LABELS: Record<string, string> = {
  'client.created': 'Cliente criado',
  'client.updated': 'Dados alterados',
  'client.deleted': 'Cliente excluído',
  'contact.created': 'Contato adicionado',
  'contact.updated': 'Contato alterado',
  'contact.deleted': 'Contato removido',
  'date.created': 'Data adicionada',
  'date.deleted': 'Data removida',
  'brand.created': 'Marca criada',
  'brand.updated': 'Marca alterada',
  'brand.deleted': 'Marca excluída',
  'profile.created': 'Perfil criado',
  'profile.updated': 'Perfil alterado',
  'profile.deleted': 'Perfil excluído',
};
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome',
  status: 'Situação',
  ownerUserId: 'Responsável',
  objectives: 'Objetivos',
  audience: 'Público',
  toneOfVoice: 'Tom de voz',
  editorialGuidelines: 'Diretrizes',
  languageRestrictions: 'Restrições de linguagem',
  allowedTopics: 'Temas permitidos',
  forbiddenTopics: 'Temas proibidos',
  visualIdentity: 'Identidade visual',
  recurringInfo: 'Informações recorrentes',
  internalNotes: 'Observações internas',
  approvalFlow: 'Fluxo de aprovação',
  slaResponseHours: 'SLA de resposta',
  slaDeliveryDays: 'Prazo de entrega',
};

interface Item {
  id: string;
  action: string;
  actor: string | null;
  at: string;
  metadata: Record<string, unknown> | null;
}

export function HistoryTab({ items }: { items: Item[] }) {
  if (items.length === 0) return <EmptyState title="Sem histórico" />;
  return (
    <div className="table-wrap" role="region" aria-label="Histórico de alterações" tabIndex={0}>
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
            const changes = (h.metadata?.changes ?? null) as Record<
              string,
              { from: unknown; to: unknown }
            > | null;
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
                  {changes && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      {Object.entries(changes).map(([k, v]) => (
                        <li key={k}>
                          <em>{FIELD_LABELS[k] ?? k}</em>: {String(v.from ?? '—')} →{' '}
                          {String(v.to ?? '—')}
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
