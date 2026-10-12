CREATE TABLE approvals (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  content_id CHAR(26) NOT NULL,
  round INT UNSIGNED NOT NULL,
  version_id CHAR(26) NOT NULL,
  status ENUM('pending','approved','changes_requested','cancelled','superseded') NOT NULL DEFAULT 'pending',
  pending_key CHAR(26) NULL,
  message TEXT NULL,
  requested_by CHAR(26) NULL,
  requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  decided_by CHAR(26) NULL,
  decided_at TIMESTAMP(3) NULL,
  decision_comment TEXT NULL,
  UNIQUE KEY uq_approvals_round (content_id, round),
  UNIQUE KEY uq_approvals_pending (pending_key),
  KEY ix_approvals_org (organization_id, client_id, status),
  CONSTRAINT fk_approvals_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_approvals_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_approvals_content FOREIGN KEY (content_id) REFERENCES contents(id),
  CONSTRAINT fk_approvals_version FOREIGN KEY (version_id) REFERENCES content_versions(id),
  CONSTRAINT fk_approvals_requested FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_approvals_decided FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_assets (
  approval_id CHAR(26) NOT NULL,
  asset_id CHAR(26) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'attachment',
  PRIMARY KEY (approval_id, asset_id),
  CONSTRAINT fk_approval_assets_approval FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_assets_asset FOREIGN KEY (asset_id) REFERENCES assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE approval_comments (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  approval_id CHAR(26) NOT NULL,
  author_id CHAR(26) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_approval_comments (approval_id, created_at),
  CONSTRAINT fk_approval_comments_approval FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
