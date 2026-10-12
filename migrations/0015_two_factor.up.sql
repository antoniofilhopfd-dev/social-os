ALTER TABLE users
  ADD COLUMN totp_secret_enc VARCHAR(400) NULL,
  ADD COLUMN totp_enabled_at TIMESTAMP(3) NULL,
  ADD COLUMN totp_last_step BIGINT UNSIGNED NULL;

CREATE TABLE recovery_codes (
  id CHAR(26) NOT NULL PRIMARY KEY,
  user_id CHAR(26) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  used_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_recovery_code (user_id, code_hash),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
