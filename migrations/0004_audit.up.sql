CREATE TABLE audit_logs (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NULL,
  actor_user_id CHAR(26) NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(48) NULL,
  entity_id VARCHAR(26) NULL,
  metadata JSON NULL,
  ip VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_audit_org_time (organization_id, created_at),
  KEY ix_audit_actor (actor_user_id, created_at),
  KEY ix_audit_action (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
