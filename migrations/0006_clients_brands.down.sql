DROP TABLE IF EXISTS social_profiles;
DROP TABLE IF EXISTS brands;
DROP TABLE IF EXISTS client_dates;
DROP TABLE IF EXISTS client_contacts;
ALTER TABLE clients
  DROP FOREIGN KEY fk_clients_owner,
  DROP COLUMN status, DROP COLUMN owner_user_id, DROP COLUMN objectives, DROP COLUMN audience,
  DROP COLUMN tone_of_voice, DROP COLUMN editorial_guidelines, DROP COLUMN language_restrictions,
  DROP COLUMN allowed_topics, DROP COLUMN forbidden_topics, DROP COLUMN visual_identity,
  DROP COLUMN recurring_info, DROP COLUMN internal_notes, DROP COLUMN approval_flow,
  DROP COLUMN sla_response_hours, DROP COLUMN sla_delivery_days;
