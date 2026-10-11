ALTER TABLE organizations ADD COLUMN storage_limit_mb INT UNSIGNED NOT NULL DEFAULT 5120;

CREATE TABLE asset_folders (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  brand_id CHAR(26) NULL,
  parent_id CHAR(26) NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_folders_client (organization_id, client_id, deleted_at),
  CONSTRAINT fk_folders_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_folders_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_folders_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES asset_folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE assets (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  brand_id CHAR(26) NULL,
  folder_id CHAR(26) NULL,
  root_asset_id CHAR(26) NOT NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  is_latest TINYINT(1) NOT NULL DEFAULT 1,
  display_name VARCHAR(190) NOT NULL,
  original_name VARCHAR(190) NOT NULL,
  mime VARCHAR(100) NOT NULL,
  kind ENUM('image','video','document','other') NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  description VARCHAR(1000) NULL,
  credits VARCHAR(255) NULL,
  origin VARCHAR(255) NULL,
  uploaded_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  UNIQUE KEY uq_assets_storage (storage_key),
  KEY ix_assets_client (organization_id, client_id, deleted_at, is_latest),
  KEY ix_assets_hash (organization_id, client_id, sha256),
  KEY ix_assets_root (root_asset_id, version_number),
  KEY ix_assets_folder (folder_id),
  CONSTRAINT fk_assets_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_assets_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_assets_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_folder FOREIGN KEY (folder_id) REFERENCES asset_folders(id) ON DELETE SET NULL,
  CONSTRAINT fk_assets_user FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE asset_tags (
  asset_id CHAR(26) NOT NULL,
  tag VARCHAR(40) NOT NULL,
  PRIMARY KEY (asset_id, tag),
  KEY ix_asset_tags_tag (tag),
  CONSTRAINT fk_asset_tags_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE asset_favorites (
  asset_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (asset_id, user_id),
  CONSTRAINT fk_favs_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_favs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE content_assets (
  content_id CHAR(26) NOT NULL,
  asset_id CHAR(26) NOT NULL,
  role ENUM('attachment','cover','reference') NOT NULL DEFAULT 'attachment',
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (content_id, asset_id),
  KEY ix_content_assets_asset (asset_id),
  CONSTRAINT fk_ca_content FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE,
  CONSTRAINT fk_ca_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
