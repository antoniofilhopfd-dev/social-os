CREATE TABLE organizations (
  id CHAR(26) NOT NULL PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_organizations_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE users (
  id CHAR(26) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  name VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,
  kind ENUM('internal','external') NOT NULL DEFAULT 'internal',
  is_platform_admin TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE clients (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  name VARCHAR(190) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_clients_org (organization_id, deleted_at),
  CONSTRAINT fk_clients_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE permissions (
  code VARCHAR(64) NOT NULL PRIMARY KEY,
  module VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  description VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE roles (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NULL,
  key_name VARCHAR(64) NULL,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  kind ENUM('internal','external') NOT NULL DEFAULT 'internal',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_roles_key (key_name),
  UNIQUE KEY uq_roles_org_name (organization_id, name),
  CONSTRAINT fk_roles_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE role_permissions (
  role_id CHAR(26) NOT NULL,
  permission_code VARCHAR(64) NOT NULL,
  PRIMARY KEY (role_id, permission_code),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_code) REFERENCES permissions(code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE memberships (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  role_id CHAR(26) NOT NULL,
  scope_type ENUM('organization','client') NOT NULL DEFAULT 'organization',
  client_id CHAR(26) NULL,
  scope_key VARCHAR(26) NOT NULL DEFAULT '*',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_membership (organization_id, user_id, role_id, scope_key),
  KEY ix_memberships_user (user_id),
  CONSTRAINT fk_mem_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_mem_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_mem_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_mem_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT ck_mem_scope CHECK ((scope_type = 'organization' AND client_id IS NULL) OR (scope_type = 'client' AND client_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
