-- ActionFlow AI - MySQL 8 schema
-- Apply with:  npm run db:setup   (or automatically by docker compose on first start)

SET NAMES utf8mb4;

-- One row per JSON upload / manual entry, with the validation report.
CREATE TABLE IF NOT EXISTS import_batches (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  source        ENUM('json', 'manual', 'gmail') NOT NULL,
  filename      VARCHAR(255) NULL,
  total_count   INT NOT NULL DEFAULT 0,
  imported      INT NOT NULL DEFAULT 0,
  skipped       INT NOT NULL DEFAULT 0,
  failed        INT NOT NULL DEFAULT 0,
  errors        JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Raw messages exactly as imported (mandatory JSON fields + any extra fields).
CREATE TABLE IF NOT EXISTS messages (
  id               VARCHAR(64)  NOT NULL PRIMARY KEY,      -- e.g. MSG001 (from the JSON)
  type             ENUM('email', 'message') NOT NULL,
  sender_name      VARCHAR(255) NOT NULL,
  sender_email     VARCHAR(320) NOT NULL,
  recipient        VARCHAR(320) NOT NULL,
  subject          VARCHAR(500) NOT NULL,
  sent_at          DATETIME     NOT NULL,                  -- normalised to UTC
  date_raw         VARCHAR(40)  NOT NULL,                  -- original ISO 8601 string (keeps the offset)
  content          TEXT         NOT NULL,
  attachments      JSON         NOT NULL,
  extra            JSON         NULL,                      -- extra fields present in the source JSON
  source           ENUM('json', 'manual', 'gmail') NOT NULL DEFAULT 'json',
  import_batch_id  INT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_sent_at (sent_at),
  FULLTEXT KEY ft_messages_text (subject, content, sender_name),
  CONSTRAINT fk_messages_batch FOREIGN KEY (import_batch_id) REFERENCES import_batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI understanding of a message (1:1 with messages).
CREATE TABLE IF NOT EXISTS message_analyses (
  message_id         VARCHAR(64)  NOT NULL PRIMARY KEY,
  summary            TEXT         NOT NULL,
  category           VARCHAR(40)  NOT NULL,
  intent             VARCHAR(255) NOT NULL,
  priority           ENUM('high', 'medium', 'low') NOT NULL,
  requires_response  TINYINT(1)   NOT NULL DEFAULT 0,
  requires_action    TINYINT(1)   NOT NULL DEFAULT 0,
  sentiment          VARCHAR(20)  NULL,
  suggested_reply    TEXT         NULL,
  reasoning          TEXT         NULL,                    -- short "why this priority" explanation
  provider           VARCHAR(40)  NOT NULL,                -- gemini | heuristic
  model              VARCHAR(80)  NULL,
  analyzed_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_analysis_category (category),
  KEY idx_analysis_priority (priority),
  CONSTRAINT fk_analysis_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Actionable tasks (AI-extracted or created by the user).
CREATE TABLE IF NOT EXISTS tasks (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  message_id        VARCHAR(64)  NULL,
  title             VARCHAR(255) NOT NULL,
  description       TEXT         NULL,
  priority          ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
  status            ENUM('pending', 'in_progress', 'completed') NOT NULL DEFAULT 'pending',
  due_date          DATE         NULL,
  due_date_evidence VARCHAR(255) NULL,                     -- exact phrase from the message that states the deadline
  source            ENUM('ai', 'manual') NOT NULL DEFAULT 'ai',
  user_modified     TINYINT(1)   NOT NULL DEFAULT 0,       -- protects user edits from re-analysis
  duplicate_of      INT NULL,                              -- possible duplicate of another open task
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at      TIMESTAMP NULL,
  KEY idx_tasks_status (status),
  KEY idx_tasks_priority (priority),
  KEY idx_tasks_due (due_date),
  FULLTEXT KEY ft_tasks_text (title, description),
  CONSTRAINT fk_tasks_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_duplicate FOREIGN KEY (duplicate_of) REFERENCES tasks(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- "task_id cannot be completed before depends_on_id is completed".
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id        INT NOT NULL,
  depends_on_id  INT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, depends_on_id),
  CONSTRAINT fk_dep_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_on   FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT chk_dep_self CHECK (task_id <> depends_on_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI-generated daily briefings.
CREATE TABLE IF NOT EXISTS daily_summaries (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  summary_date  DATE        NOT NULL,
  content       TEXT        NOT NULL,
  stats         JSON        NULL,
  provider      VARCHAR(40) NOT NULL,
  model         VARCHAR(80) NULL,
  created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_summary_date (summary_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
