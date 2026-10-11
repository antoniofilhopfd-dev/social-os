-- Linha de base: valida a cadeia de migrações. Tabelas de domínio começam na Etapa 02.
CREATE TABLE IF NOT EXISTS system_info (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO system_info (`key`, `value`) VALUES ('schema_baseline', '0001') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
