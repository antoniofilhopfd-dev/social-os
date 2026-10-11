CREATE TABLE content_drafts (
  content_id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  body JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  updated_by CHAR(26) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_drafts_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_drafts_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_drafts_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE content_versions (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  content_id CHAR(26) NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  body JSON NOT NULL,
  note VARCHAR(500) NULL,
  source ENUM('human','ai_assisted') NOT NULL DEFAULT 'human',
  restored_from CHAR(26) NULL,
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_versions_number (content_id, version_number),
  KEY ix_versions_org (organization_id, content_id),
  CONSTRAINT fk_versions_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_versions_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_versions_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE text_blocks (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NULL,
  name VARCHAR(120) NOT NULL,
  kind ENUM('cta','hashtags','disclaimer','signature','other') NOT NULL DEFAULT 'other',
  text TEXT NOT NULL,
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_blocks_org (organization_id, deleted_at),
  CONSTRAINT fk_blocks_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_blocks_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE content_templates (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NULL,
  name VARCHAR(120) NOT NULL,
  format VARCHAR(32) NULL,
  body JSON NOT NULL,
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_templates_org (organization_id, deleted_at),
  CONSTRAINT fk_templates_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_templates_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
