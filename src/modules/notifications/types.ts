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
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];
export const isNotificationType = (v: string): v is NotificationType => v in NOTIFICATION_TYPES;
