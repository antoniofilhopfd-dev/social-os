/** Rótulos puros (seguros para importar em componentes de cliente). */
export const NETWORK_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  other: 'Outra',
};
export const PROFILE_STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  inactive: 'Inativo',
};
export const APPROVAL_FLOW_LABELS: Record<string, string> = {
  internal_then_client: 'Revisão interna e depois o cliente',
  client_only: 'Apenas o cliente',
  internal_only: 'Apenas revisão interna',
};
export const EVENT_LABELS: Record<string, string> = {
  created: 'Solicitação criada',
  status_changed: 'Situação alterada',
  commented: 'Comentário',
  assigned: 'Responsável/prazo atualizado',
  info_requested: 'Informações solicitadas',
  info_provided: 'Informações enviadas',
  priority_changed: 'Prioridade alterada',
  updated: 'Dados atualizados',
};
