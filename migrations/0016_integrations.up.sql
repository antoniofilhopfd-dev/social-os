CREATE TABLE integration_connections (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  status ENUM('active','disabled','error') NOT NULL DEFAULT 'active',
  secret_enc VARCHAR(1000) NULL,
  secret_hint VARCHAR(12) NULL,
  model VARCHAR(80) NULL,
  last_checked_at TIMESTAMP(3) NULL,
  last_error VARCHAR(300) NULL,
  created_by CHAR(26) NULL,
  updated_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_integration_provider (organization_id, provider),
  CONSTRAINT fk_integrations_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_integrations_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_integrations_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ai_usage (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  user_id CHAR(26) NULL,
  content_id CHAR(26) NULL,
  task VARCHAR(40) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  model VARCHAR(80) NULL,
  status ENUM('ok','error') NOT NULL,
  input_tokens INT UNSIGNED NULL,
  output_tokens INT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_ai_usage_org (organization_id, created_at),
  KEY ix_ai_usage_user (organization_id, user_id, created_at),
  CONSTRAINT fk_ai_usage_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
