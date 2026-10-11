CREATE TABLE request_types (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  name VARCHAR(120) NOT NULL,
  required_fields JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_request_types_name (organization_id, name),
  CONSTRAINT fk_rtypes_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE request_counters (
  organization_id CHAR(26) NOT NULL PRIMARY KEY,
  last_number INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT fk_rcounters_org FOREIGN KEY (organization_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE requests (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  number INT UNSIGNED NOT NULL,
  client_id CHAR(26) NOT NULL,
  brand_id CHAR(26) NULL,
  type_id CHAR(26) NOT NULL,
  requester_user_id CHAR(26) NULL,
  requester_name VARCHAR(190) NOT NULL,
  title VARCHAR(190) NOT NULL,
  description TEXT NOT NULL,
  objective TEXT NULL,
  audience VARCHAR(500) NULL,
  network ENUM('instagram','facebook','tiktok','linkedin','youtube','pinterest','other') NULL,
  format VARCHAR(80) NULL,
  desired_date DATE NULL,
  reference_notes TEXT NULL,
  approval_required TINYINT(1) NOT NULL DEFAULT 1,
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  original_priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  urgency_reason VARCHAR(500) NULL,
  status ENUM('new','in_triage','awaiting_info','accepted','rejected','cancelled') NOT NULL DEFAULT 'new',
  assignee_user_id CHAR(26) NULL,
  estimated_due DATE NULL,
  first_response_due_at DATETIME(3) NULL,
  first_response_at DATETIME(3) NULL,
  possible_duplicate_of CHAR(26) NULL,
  converted_to_type VARCHAR(32) NULL,
  converted_to_id CHAR(26) NULL,
  closed_at DATETIME(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_requests_number (organization_id, number),
  KEY ix_requests_list (organization_id, status, created_at),
  KEY ix_requests_client (organization_id, client_id, status),
  KEY ix_requests_assignee (organization_id, assignee_user_id, status),
  CONSTRAINT fk_requests_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_requests_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_requests_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE SET NULL,
  CONSTRAINT fk_requests_type FOREIGN KEY (type_id) REFERENCES request_types(id),
  CONSTRAINT fk_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_requests_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE request_events (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  request_id CHAR(26) NOT NULL,
  actor_user_id CHAR(26) NULL,
  kind ENUM('created','status_changed','commented','assigned','info_requested','info_provided','priority_changed','updated') NOT NULL,
  body TEXT NULL,
  metadata JSON NULL,
  internal_only TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_revents_request (organization_id, request_id, id),
  CONSTRAINT fk_revents_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_revents_request FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_revents_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
