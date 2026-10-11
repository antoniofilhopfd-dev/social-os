CREATE TABLE notifications (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  user_id CHAR(26) NOT NULL,
  type VARCHAR(48) NOT NULL,
  title VARCHAR(190) NOT NULL,
  body VARCHAR(500) NOT NULL DEFAULT '',
  link VARCHAR(255) NULL,
  read_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_notif_user (user_id, organization_id, read_at, created_at),
  CONSTRAINT fk_notif_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notification_preferences (
  user_id CHAR(26) NOT NULL,
  type VARCHAR(48) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, type),
  CONSTRAINT fk_notifpref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
