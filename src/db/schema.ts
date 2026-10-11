import {
  bigint,
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
