CREATE TABLE projects (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description TEXT NULL,
  status ENUM('planning','active','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  start_date DATE NULL,
  due_date DATE NULL,
  owner_user_id CHAR(26) NULL,
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_projects_org (organization_id, client_id, status),
  CONSTRAINT fk_projects_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_projects_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tasks (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  client_id CHAR(26) NULL,
  project_id CHAR(26) NULL,
  content_id CHAR(26) NULL,
  title VARCHAR(190) NOT NULL,
  description TEXT NULL,
  status ENUM('todo','in_progress','blocked','in_review','done','cancelled') NOT NULL DEFAULT 'todo',
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  due_date DATE NULL,
  assignee_user_id CHAR(26) NULL,
  blocked_reason VARCHAR(500) NULL,
  completed_at TIMESTAMP(3) NULL,
  created_by CHAR(26) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at TIMESTAMP(3) NULL,
  KEY ix_tasks_org (organization_id, status, due_date),
  KEY ix_tasks_assignee (organization_id, assignee_user_id, status),
  KEY ix_tasks_project (project_id),
  KEY ix_tasks_content (content_id),
  CONSTRAINT fk_tasks_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
  CONSTRAINT fk_tasks_client FOREIGN KEY (client_id) REFERENCES clients(id),
  CONSTRAINT fk_tasks_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_tasks_content FOREIGN KEY (content_id) REFERENCES contents(id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assignee_user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE task_checklist_items (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  task_id CHAR(26) NOT NULL,
  text VARCHAR(300) NOT NULL,
  done TINYINT NOT NULL DEFAULT 0,
  position INT UNSIGNED NOT NULL DEFAULT 0,
  KEY ix_checklist_task (task_id, position),
  CONSTRAINT fk_checklist_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE task_comments (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  task_id CHAR(26) NOT NULL,
  author_id CHAR(26) NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_comments_task (task_id, created_at),
  CONSTRAINT fk_comments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE task_events (
  id CHAR(26) NOT NULL PRIMARY KEY,
  organization_id CHAR(26) NOT NULL,
  task_id CHAR(26) NOT NULL,
  actor_user_id CHAR(26) NULL,
  kind VARCHAR(40) NOT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_task_events (task_id, created_at),
  CONSTRAINT fk_task_events_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
