ALTER TABLE clients
  ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active' AFTER name,
  ADD COLUMN owner_user_id CHAR(26) NULL AFTER status,
  ADD COLUMN objectives TEXT NULL,
  ADD COLUMN audience TEXT NULL,
  ADD COLUMN tone_of_voice TEXT NULL,
  ADD COLUMN editorial_guidelines TEXT NULL,
  ADD COLUMN language_restrictions TEXT NULL,
  ADD COLUMN allowed_topics TEXT NULL,
  ADD COLUMN forbidden_topics TEXT NULL,
  ADD COLUMN visual_identity TEXT NULL,
  ADD COLUMN recurring_info TEXT NULL,
  ADD COLUMN internal_notes TEXT NULL,
  ADD COLUMN approval_flow ENUM('internal_then_client','client_only','internal_only') NOT NULL DEFAULT 'internal_then_client',
  ADD COLUMN sla_response_hours SMALLINT UNSIGNED NULL,
  ADD COLUMN sla_delivery_days SMALLINT UNSIGNED NULL,
  ADD CONSTRAINT fk_clients_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE client_contacts (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  name VARCHAR(190) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(40) NULL,
  role_title VARCHAR(120) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY ix_contacts_client (organization_id, client_id),
  CONSTRAINT fk_contacts_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_contacts_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE client_dates (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  label VARCHAR(190) NOT NULL,
  event_date DATE NOT NULL,
  yearly TINYINT(1) NOT NULL DEFAULT 1,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_dates_client (organization_id, client_id),
  CONSTRAINT fk_dates_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_dates_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE brands (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  name VARCHAR(190) NOT NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  description TEXT NULL,
  objectives TEXT NULL,
  audience TEXT NULL,
  tone_of_voice TEXT NULL,
  editorial_guidelines TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_brands_client (organization_id, client_id, deleted_at),
  CONSTRAINT fk_brands_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_brands_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE social_profiles (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  brand_id CHAR(26) NOT NULL,
  network ENUM('instagram','facebook','tiktok','linkedin','youtube','pinterest','other') NOT NULL,
  profile_name VARCHAR(190) NOT NULL,
  handle VARCHAR(190) NOT NULL,
  url VARCHAR(500) NULL,
  owner_user_id CHAR(26) NULL,
  status ENUM('active','paused','inactive') NOT NULL DEFAULT 'active',
  account_type VARCHAR(80) NULL,
  publish_mode ENUM('manual') NOT NULL DEFAULT 'manual',
  integration_status ENUM('not_connected') NOT NULL DEFAULT 'not_connected',
  last_sync_at TIMESTAMP(3) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_profiles_brand (organization_id, brand_id, deleted_at),
  CONSTRAINT fk_profiles_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_profiles_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE,
  CONSTRAINT fk_profiles_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
