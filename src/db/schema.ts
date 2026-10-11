import {
  bigint,
  date,
  datetime,
  int,
  smallint,
  text,
  time,
  char,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  timestamp,
  tinyint,
  varchar,
} from 'drizzle-orm/mysql-core';

const id = (name = 'id') => char(name, { length: 26 });
const ts = (name: string) => timestamp(name, { fsp: 3, mode: 'date' });

export const organizations = mysqlTable('organizations', {
  id: id().primaryKey(),
  name: varchar('name', { length: 190 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull(),
  status: mysqlEnum('status', ['active', 'suspended']).notNull().default('active'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const users = mysqlTable('users', {
  id: id().primaryKey(),
  email: varchar('email', { length: 254 }).notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  kind: mysqlEnum('kind', ['internal', 'external']).notNull().default('internal'),
  isPlatformAdmin: tinyint('is_platform_admin').notNull().default(0),
  status: mysqlEnum('status', ['active', 'disabled']).notNull().default('active'),
  lastLoginAt: ts('last_login_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const clients = mysqlTable('clients', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  status: mysqlEnum('status', ['active', 'inactive']).notNull().default('active'),
  ownerUserId: id('owner_user_id'),
  objectives: text('objectives'),
  audience: text('audience'),
  toneOfVoice: text('tone_of_voice'),
  editorialGuidelines: text('editorial_guidelines'),
  languageRestrictions: text('language_restrictions'),
  allowedTopics: text('allowed_topics'),
  forbiddenTopics: text('forbidden_topics'),
  visualIdentity: text('visual_identity'),
  recurringInfo: text('recurring_info'),
  internalNotes: text('internal_notes'),
  approvalFlow: mysqlEnum('approval_flow', ['internal_then_client', 'client_only', 'internal_only'])
    .notNull()
    .default('internal_then_client'),
  slaResponseHours: smallint('sla_response_hours', { unsigned: true }),
  slaDeliveryDays: smallint('sla_delivery_days', { unsigned: true }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const permissions = mysqlTable('permissions', {
  code: varchar('code', { length: 64 }).primaryKey(),
  module: varchar('module', { length: 32 }).notNull(),
  action: varchar('action', { length: 32 }).notNull(),
  description: varchar('description', { length: 190 }).notNull(),
});

export const roles = mysqlTable('roles', {
  id: id().primaryKey(),
  organizationId: id('organization_id'),
  keyName: varchar('key_name', { length: 64 }),
  name: varchar('name', { length: 120 }).notNull(),
  description: varchar('description', { length: 255 }).notNull().default(''),
  isSystem: tinyint('is_system').notNull().default(0),
  kind: mysqlEnum('kind', ['internal', 'external']).notNull().default('internal'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const rolePermissions = mysqlTable(
  'role_permissions',
  {
    roleId: id('role_id').notNull(),
    permissionCode: varchar('permission_code', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionCode] })],
);

export const memberships = mysqlTable('memberships', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  userId: id('user_id').notNull(),
  roleId: id('role_id').notNull(),
  scopeType: mysqlEnum('scope_type', ['organization', 'client']).notNull().default('organization'),
  clientId: id('client_id'),
  scopeKey: varchar('scope_key', { length: 26 }).notNull().default('*'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const sessions = mysqlTable('sessions', {
  id: id().primaryKey(),
  userId: id('user_id').notNull(),
  organizationId: id('organization_id'),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  ip: varchar('ip', { length: 64 }),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: ts('created_at').notNull().defaultNow(),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
});

export const invitations = mysqlTable('invitations', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  email: varchar('email', { length: 254 }).notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  roleId: id('role_id').notNull(),
  scopeType: mysqlEnum('scope_type', ['organization', 'client']).notNull().default('organization'),
  clientId: id('client_id'),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  revokedAt: ts('revoked_at'),
  createdBy: id('created_by').notNull(),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const passwordResets = mysqlTable('password_resets', {
  id: id().primaryKey(),
  userId: id('user_id').notNull(),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  expiresAt: ts('expires_at').notNull(),
  usedAt: ts('used_at'),
  createdBy: id('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const authAttempts = mysqlTable('auth_attempts', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  kind: mysqlEnum('kind', ['login', 'token']).notNull(),
  subjectHash: char('subject_hash', { length: 64 }).notNull(),
  ip: varchar('ip', { length: 64 }),
  succeeded: tinyint('succeeded').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const auditLogs = mysqlTable('audit_logs', {
  id: id().primaryKey(),
  organizationId: id('organization_id'),
  actorUserId: id('actor_user_id'),
  action: varchar('action', { length: 64 }).notNull(),
  entityType: varchar('entity_type', { length: 48 }),
  entityId: varchar('entity_id', { length: 26 }),
  metadata: json('metadata').$type<Record<string, unknown> | null>(),
  ip: varchar('ip', { length: 64 }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const notifications = mysqlTable('notifications', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  userId: id('user_id').notNull(),
  type: varchar('type', { length: 48 }).notNull(),
  title: varchar('title', { length: 190 }).notNull(),
  body: varchar('body', { length: 500 }).notNull().default(''),
  link: varchar('link', { length: 255 }),
  readAt: ts('read_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const notificationPreferences = mysqlTable(
  'notification_preferences',
  {
    userId: id('user_id').notNull(),
    type: varchar('type', { length: 48 }).notNull(),
    enabled: tinyint('enabled').notNull().default(1),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const NETWORKS = [
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'youtube',
  'pinterest',
  'other',
] as const;
export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const REQUEST_STATUSES = [
  'new',
  'in_triage',
  'awaiting_info',
  'accepted',
  'rejected',
  'cancelled',
] as const;

export const clientContacts = mysqlTable('client_contacts', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  clientId: id('client_id').notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  email: varchar('email', { length: 254 }),
  phone: varchar('phone', { length: 40 }),
  roleTitle: varchar('role_title', { length: 120 }),
  isPrimary: tinyint('is_primary').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const clientDates = mysqlTable('client_dates', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  clientId: id('client_id').notNull(),
  label: varchar('label', { length: 190 }).notNull(),
  eventDate: date('event_date', { mode: 'string' }).notNull(),
  yearly: tinyint('yearly').notNull().default(1),
  note: varchar('note', { length: 500 }),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const brands = mysqlTable('brands', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  clientId: id('client_id').notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  status: mysqlEnum('status', ['active', 'inactive']).notNull().default('active'),
  description: text('description'),
  objectives: text('objectives'),
  audience: text('audience'),
  toneOfVoice: text('tone_of_voice'),
  editorialGuidelines: text('editorial_guidelines'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const socialProfiles = mysqlTable('social_profiles', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  brandId: id('brand_id').notNull(),
  network: mysqlEnum('network', NETWORKS).notNull(),
  profileName: varchar('profile_name', { length: 190 }).notNull(),
  handle: varchar('handle', { length: 190 }).notNull(),
  url: varchar('url', { length: 500 }),
  ownerUserId: id('owner_user_id'),
  status: mysqlEnum('status', ['active', 'paused', 'inactive']).notNull().default('active'),
  accountType: varchar('account_type', { length: 80 }),
  publishMode: mysqlEnum('publish_mode', ['manual']).notNull().default('manual'),
  integrationStatus: mysqlEnum('integration_status', ['not_connected'])
    .notNull()
    .default('not_connected'),
  lastSyncAt: ts('last_sync_at'),
  notes: varchar('notes', { length: 500 }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const requestTypes = mysqlTable('request_types', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  requiredFields: json('required_fields').$type<string[]>().notNull(),
  active: tinyint('active').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const requestCounters = mysqlTable('request_counters', {
  organizationId: id('organization_id').primaryKey(),
  lastNumber: int('last_number', { unsigned: true }).notNull().default(0),
});

export const requests = mysqlTable('requests', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  number: int('number', { unsigned: true }).notNull(),
  clientId: id('client_id').notNull(),
  brandId: id('brand_id'),
  typeId: id('type_id').notNull(),
  requesterUserId: id('requester_user_id'),
  requesterName: varchar('requester_name', { length: 190 }).notNull(),
  title: varchar('title', { length: 190 }).notNull(),
  description: text('description').notNull(),
  objective: text('objective'),
  audience: varchar('audience', { length: 500 }),
  network: mysqlEnum('network', NETWORKS),
  format: varchar('format', { length: 80 }),
  desiredDate: date('desired_date', { mode: 'string' }),
  referenceNotes: text('reference_notes'),
  approvalRequired: tinyint('approval_required').notNull().default(1),
  priority: mysqlEnum('priority', PRIORITIES).notNull().default('normal'),
  originalPriority: mysqlEnum('original_priority', PRIORITIES).notNull().default('normal'),
  urgencyReason: varchar('urgency_reason', { length: 500 }),
  status: mysqlEnum('status', REQUEST_STATUSES).notNull().default('new'),
  assigneeUserId: id('assignee_user_id'),
  estimatedDue: date('estimated_due', { mode: 'string' }),
  firstResponseDueAt: datetime('first_response_due_at', { fsp: 3, mode: 'date' }),
  firstResponseAt: datetime('first_response_at', { fsp: 3, mode: 'date' }),
  possibleDuplicateOf: id('possible_duplicate_of'),
  convertedToType: varchar('converted_to_type', { length: 32 }),
  convertedToId: id('converted_to_id'),
  closedAt: datetime('closed_at', { fsp: 3, mode: 'date' }),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const requestEvents = mysqlTable('request_events', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  requestId: id('request_id').notNull(),
  actorUserId: id('actor_user_id'),
  kind: mysqlEnum('kind', [
    'created',
    'status_changed',
    'commented',
    'assigned',
    'info_requested',
    'info_provided',
    'priority_changed',
    'updated',
  ]).notNull(),
  body: text('body'),
  metadata: json('metadata').$type<Record<string, unknown> | null>(),
  internalOnly: tinyint('internal_only').notNull().default(0),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const CONTENT_FORMATS = [
  'static_post',
  'carousel',
  'reels',
  'stories',
  'story_sequence',
  'video',
  'text',
  'institutional',
  'educational',
  'promotional',
  'other',
] as const;
export const CONTENT_STATUSES = [
  'draft',
  'in_production',
  'internal_review',
  'awaiting_client',
  'changes_requested',
  'approved',
  'scheduled',
  'published',
  'cancelled',
  'archived',
] as const;

export const contentPillars = mysqlTable('content_pillars', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  color: varchar('color', { length: 16 }).notNull().default('blue'),
  description: varchar('description', { length: 500 }),
  active: tinyint('active').notNull().default(1),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const campaigns = mysqlTable('campaigns', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  clientId: id('client_id').notNull(),
  name: varchar('name', { length: 190 }).notNull(),
  description: varchar('description', { length: 1000 }),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  status: mysqlEnum('status', ['active', 'inactive']).notNull().default('active'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});

export const contentCounters = mysqlTable('content_counters', {
  organizationId: id('organization_id').primaryKey(),
  lastNumber: int('last_number', { unsigned: true }).notNull().default(0),
});

export const contents = mysqlTable('contents', {
  id: id().primaryKey(),
  organizationId: id('organization_id').notNull(),
  number: int('number', { unsigned: true }).notNull(),
  clientId: id('client_id').notNull(),
  brandId: id('brand_id'),
  socialProfileId: id('social_profile_id'),
  pillarId: id('pillar_id'),
  campaignId: id('campaign_id'),
  requestId: id('request_id'),
  title: varchar('title', { length: 190 }).notNull(),
  theme: varchar('theme', { length: 190 }),
  objective: text('objective'),
  audience: varchar('audience', { length: 500 }),
  format: mysqlEnum('format', CONTENT_FORMATS).notNull(),
  brief: text('brief'),
  scheduledDate: date('scheduled_date', { mode: 'string' }),
  scheduledTime: time('scheduled_time'),
  assigneeUserId: id('assignee_user_id'),
  priority: mysqlEnum('priority', PRIORITIES).notNull().default('normal'),
  status: mysqlEnum('status', CONTENT_STATUSES).notNull().default('draft'),
  createdBy: id('created_by'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  deletedAt: ts('deleted_at'),
});
