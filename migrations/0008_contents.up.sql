CREATE TABLE content_pillars (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  name VARCHAR(120) NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT 'blue',
  description VARCHAR(500) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_pillars_name (organization_id, name),
  CONSTRAINT fk_pillars_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE campaigns (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description VARCHAR(1000) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_campaigns_client (organization_id, client_id, deleted_at),
  CONSTRAINT fk_campaigns_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_campaigns_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE content_counters (
  organization_id CHAR(26) NOT NULL PRIMARY KEY,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_ccounters_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE contents (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  number INT UNSIGNED NOT NULL,
  client_id CHAR(26) NOT NULL,
  brand_id CHAR(26) NULL,
  social_profile_id CHAR(26) NULL,
  pillar_id CHAR(26) NULL,
  campaign_id CHAR(26) NULL,
  request_id CHAR(26) NULL,
  title VARCHAR(190) NOT NULL,
  theme VARCHAR(190) NULL,
  objective TEXT NULL,
  audience VARCHAR(500) NULL,
  format ENUM('static_post','carousel','reels','stories','story_sequence','video','text','institutional','educational','promotional','other') NOT NULL,
  brief TEXT NULL,
  scheduled_date DATE NULL,
  scheduled_time TIME NULL,
  assignee_user_id CHAR(26) NULL,
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  status ENUM('draft','in_production','internal_review','awaiting_client','changes_requested','approved','scheduled','published','cancelled','archived') NOT NULL DEFAULT 'draft',
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  UNIQUE KEY uq_contents_number (organization_id, number),
  KEY ix_contents_date (organization_id, deleted_at, scheduled_date),
  KEY ix_contents_client (organization_id, client_id, status),
  KEY ix_contents_assignee (organization_id, assignee_user_id, status),
  CONSTRAINT fk_contents_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_contents_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_contents_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_profile FOREIGN KEY (social_profile_id) REFERENCES social_profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_pillar FOREIGN KEY (pillar_id) REFERENCES content_pillars(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_contents_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
