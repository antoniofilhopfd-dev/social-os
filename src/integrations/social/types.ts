/**
 * Publicação automática em redes sociais. NENHUMA rede está conectada: cada plataforma exige um aplicativo
 * cadastrado e aprovado por ela (e credenciais OAuth da agência/cliente), o que depende de terceiros.
 * Enquanto isso, a publicação é assistida (Etapa 09). Esta interface define o contrato que cada conector
 * deverá cumprir quando for homologado — sem simulações.
 */
export type SocialNetwork =
  'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'youtube' | 'pinterest';

export interface PublishRequest {
  text: string;
  mediaUrls: string[];
  scheduledAt?: Date;
}
export interface PublishResult {
  externalId: string;
  url: string | null;
}
export interface SocialPublisher {
  readonly network: SocialNetwork;
  readonly connected: boolean;
  publish(request: PublishRequest): Promise<PublishResult>;
}

export interface NetworkRequirement {
  network: SocialNetwork;
  label: string;
  /** O que é preciso providenciar fora do sistema (confirmar na documentação oficial vigente de cada plataforma). */
  needs: string[];
}

export const NETWORK_REQUIREMENTS: NetworkRequirement[] = [
  {
    network: 'instagram',
    label: 'Instagram e Facebook (Meta)',
    needs: [
      'Aplicativo cadastrado no portal de desenvolvedores da Meta, com a empresa verificada',
      'Perfil profissional do Instagram vinculado a uma Página do Facebook',
      'Permissões de publicação de conteúdo aprovadas na revisão do aplicativo (App Review)',
      'Token de acesso de longa duração do cliente (OAuth) e rotina de renovação',
    ],
  },
  {
    network: 'linkedin',
    label: 'LinkedIn',
    needs: [
      'Aplicativo no LinkedIn Developers com o produto de publicação em Páginas aprovado',
      'Administrador da Página do cliente autorizando via OAuth',
    ],
  },
  {
    network: 'tiktok',
    label: 'TikTok',
    needs: [
      'Aplicativo no TikTok for Developers com a Content Posting API aprovada (auditoria do aplicativo)',
      'Conta do cliente autorizando via OAuth',
    ],
  },
  {
    network: 'youtube',
    label: 'YouTube',
    needs: [
      'Projeto no Google Cloud com a YouTube Data API ativada e tela de consentimento verificada',
      'Cota diária de upload adequada e canal do cliente autorizando via OAuth',
    ],
  },
  {
    network: 'pinterest',
    label: 'Pinterest',
    needs: [
      'Aplicativo no Pinterest Developers com acesso à API de Pins aprovado',
      'Conta do cliente autorizando via OAuth',
    ],
  },
];

/** Sem conectores homologados, nenhuma rede publica automaticamente. */
export const isAutoPublishAvailable = (_network: SocialNetwork): boolean => {
  void _network;
  return false;
};
