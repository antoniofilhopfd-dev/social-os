/** Catálogo de permissões (`módulo:ação`). É a fonte única; o banco é populado a partir daqui. */
export const MODULES = {
  clients: { label: 'Clientes', actions: ['view', 'create', 'edit', 'delete'] },
  requests: { label: 'Solicitações', actions: ['view', 'create', 'edit', 'delete', 'assign'] },
  contents: {
    label: 'Conteúdos',
    actions: ['view', 'create', 'edit', 'delete', 'assign', 'approve', 'publish', 'export'],
  },
  library: { label: 'Biblioteca', actions: ['view', 'create', 'edit', 'delete'] },
  tasks: { label: 'Tarefas e projetos', actions: ['view', 'create', 'edit', 'delete', 'assign'] },
  approvals: { label: 'Aprovações', actions: ['view', 'approve'] },
  publications: { label: 'Publicações', actions: ['view', 'create', 'edit', 'publish'] },
  metrics: { label: 'Resultados', actions: ['view', 'create', 'edit', 'export'] },
  team: { label: 'Equipe', actions: ['view', 'create', 'edit', 'delete', 'manage_users'] },
  roles: { label: 'Funções e permissões', actions: ['view', 'create', 'edit', 'delete'] },
  audit: { label: 'Auditoria', actions: ['view', 'export'] },
  settings: { label: 'Configurações', actions: ['view', 'edit'] },
  integrations: { label: 'Integrações', actions: ['view', 'manage_integrations'] },
} as const;

export type ModuleKey = keyof typeof MODULES;

export const ACTION_LABELS: Record<string, string> = {
  view: 'Visualizar',
  create: 'Criar',
  edit: 'Editar',
  delete: 'Excluir',
  assign: 'Atribuir responsáveis',
  approve: 'Aprovar',
  publish: 'Publicar',
  export: 'Exportar',
  manage_users: 'Gerenciar usuários',
  manage_integrations: 'Administrar integrações',
};

export interface PermissionDef {
  code: string;
  module: ModuleKey;
  action: string;
  description: string;
}

export const PERMISSIONS: PermissionDef[] = (Object.keys(MODULES) as ModuleKey[]).flatMap((m) =>
  MODULES[m].actions.map((a) => ({
    code: `${m}:${a}`,
    module: m,
    action: a,
    description: `${ACTION_LABELS[a] ?? a} · ${MODULES[m].label}`,
  })),
);

export type PermissionCode = (typeof PERMISSIONS)[number]['code'];
export const ALL_CODES: string[] = PERMISSIONS.map((p) => p.code);
export const PERMISSION_SET = new Set(ALL_CODES);

type Spec = string[]; // aceita 'modulo:acao', 'modulo:*' e '*'

function expand(spec: Spec): string[] {
  const out = new Set<string>();
  for (const s of spec) {
    if (s === '*') ALL_CODES.forEach((c) => out.add(c));
    else if (s.endsWith(':*'))
      ALL_CODES.filter((c) => c.startsWith(s.slice(0, -1))).forEach((c) => out.add(c));
    else if (PERMISSION_SET.has(s)) out.add(s);
    else throw new Error(`Permissão desconhecida no catálogo: ${s}`);
  }
  return [...out].sort();
}

export interface SystemRoleDef {
  key: string;
  name: string;
  description: string;
  kind: 'internal' | 'external';
  permissions: string[];
}

const def = (
  key: string,
  name: string,
  description: string,
  kind: 'internal' | 'external',
  spec: Spec,
): SystemRoleDef => ({ key, name, description, kind, permissions: expand(spec) });

/** Matriz padrão das funções do sistema. Funções do sistema não podem ser editadas. */
export const SYSTEM_ROLES: SystemRoleDef[] = [
  def(
    'owner',
    'Proprietário',
    'Acesso total à organização, inclusive usuários, funções e integrações.',
    'internal',
    ['*'],
  ),
  def(
    'manager',
    'Gestor da operação',
    'Opera tudo, exceto funções/permissões, gestão de usuários e integrações.',
    'internal',
    [
      'clients:*',
      'requests:*',
      'contents:*',
      'library:*',
      'tasks:*',
      'approvals:*',
      'publications:*',
      'metrics:*',
      'team:view',
      'team:create',
      'team:edit',
      'audit:view',
      'settings:view',
      'integrations:view',
    ],
  ),
  def(
    'coordinator',
    'Coordenador de social media',
    'Coordena produção, aprovação interna e atribuições.',
    'internal',
    [
      'clients:view',
      'requests:*',
      'contents:*',
      'library:*',
      'tasks:*',
      'approvals:*',
      'publications:*',
      'metrics:view',
      'metrics:export',
      'team:view',
    ],
  ),
  def('social_media', 'Social media', 'Planeja, produz e registra publicações.', 'internal', [
    'clients:view',
    'requests:view',
    'requests:create',
    'requests:edit',
    'contents:view',
    'contents:create',
    'contents:edit',
    'contents:export',
    'library:view',
    'library:create',
    'library:edit',
    'tasks:view',
    'tasks:create',
    'tasks:edit',
    'approvals:view',
    'publications:view',
    'publications:create',
    'publications:edit',
    'publications:publish',
    'metrics:view',
    'metrics:create',
  ]),
  def('writer', 'Redator', 'Escreve e edita textos dos conteúdos.', 'internal', [
    'clients:view',
    'requests:view',
    'contents:view',
    'contents:create',
    'contents:edit',
    'library:view',
    'tasks:view',
    'tasks:edit',
    'approvals:view',
  ]),
  def('designer', 'Designer', 'Produz peças e organiza arquivos.', 'internal', [
    'clients:view',
    'contents:view',
    'contents:edit',
    'library:view',
    'library:create',
    'library:edit',
    'tasks:view',
    'tasks:edit',
  ]),
  def('video_editor', 'Editor de vídeo', 'Produz vídeos e organiza arquivos.', 'internal', [
    'clients:view',
    'contents:view',
    'contents:edit',
    'library:view',
    'library:create',
    'library:edit',
    'tasks:view',
    'tasks:edit',
  ]),
  def(
    'analyst',
    'Analista de resultados',
    'Registra e analisa métricas e relatórios.',
    'internal',
    [
      'clients:view',
      'contents:view',
      'publications:view',
      'metrics:view',
      'metrics:create',
      'metrics:edit',
      'metrics:export',
    ],
  ),
  def('support', 'Atendimento', 'Recebe e faz a triagem das demandas.', 'internal', [
    'clients:view',
    'requests:*',
    'contents:view',
    'tasks:view',
    'tasks:create',
  ]),
  def('viewer', 'Somente consulta', 'Leitura dos módulos operacionais.', 'internal', [
    'clients:view',
    'requests:view',
    'contents:view',
    'library:view',
    'tasks:view',
    'approvals:view',
    'publications:view',
    'metrics:view',
  ]),
  def(
    'client',
    'Cliente externo',
    'Portal: solicitações, conteúdos, aprovações e relatórios autorizados.',
    'external',
    [
      'clients:view',
      'requests:view',
      'requests:create',
      'contents:view',
      'library:view',
      'approvals:view',
      'approvals:approve',
      'metrics:view',
    ],
  ),
  def(
    'external_approver',
    'Aprovador externo',
    'Portal: apenas revisar e aprovar conteúdos.',
    'external',
    ['clients:view', 'contents:view', 'approvals:view', 'approvals:approve'],
  ),
];

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);
