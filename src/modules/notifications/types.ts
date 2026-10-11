/** Tipos de notificação existentes nesta etapa. Novos módulos acrescentam os seus aqui. */
export const NOTIFICATION_TYPES = {
  invitation_accepted: {
    label: 'Convite aceito',
    description: 'Quando uma pessoa que você convidou aceita o convite.',
  },
  role_changed: {
    label: 'Sua função foi alterada',
    description: 'Quando um administrador muda a sua função na organização.',
  },
  password_reset_issued: {
    label: 'Link de nova senha gerado',
    description: 'Quando um administrador gera um link de redefinição para a sua conta.',
  },
  request_created: {
    label: 'Nova solicitação',
    description: 'Quando uma nova solicitação chega (para quem pode atribuir solicitações).',
  },
  request_assigned: {
    label: 'Solicitação atribuída a você',
    description: 'Quando uma solicitação é atribuída a você.',
  },
  request_info_requested: {
    label: 'Pedido de informações',
    description: 'Quando a equipe precisa de informações complementares sobre a sua solicitação.',
  },
  request_info_provided: {
    label: 'Informações ou comentário recebido',
    description: 'Quando o solicitante responde ou comenta em uma solicitação atribuída a você.',
  },
  content_assigned: {
    label: 'Conteúdo atribuído a você',
    description: 'Quando um conteúdo é atribuído a você.',
  },
  request_status_changed: {
    label: 'Situação da solicitação atualizada',
    description: 'Quando a situação de uma solicitação que você abriu muda.',
  },
  task_assigned: {
    label: 'Tarefa atribuída a você',
    description: 'Quando uma tarefa é criada ou atribuída a você.',
  },
  task_status: {
    label: 'Situação da tarefa atualizada',
    description: 'Quando uma tarefa que você criou é concluída ou bloqueada.',
  },
  task_comment: {
    label: 'Comentário em tarefa',
    description: 'Quando alguém comenta em uma tarefa atribuída a você.',
  },
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];
export const isNotificationType = (v: string): v is NotificationType => v in NOTIFICATION_TYPES;
