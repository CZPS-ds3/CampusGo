-- Admin area, account status, audit log, name rules and place photos.

ALTER TABLE students
  ADD COLUMN role          ENUM('student', 'admin') NOT NULL DEFAULT 'student',
  ADD COLUMN status        ENUM('active', 'blocked', 'archived', 'deleted') NOT NULL DEFAULT 'active',
  ADD COLUMN status_reason VARCHAR(200) NULL,
  ADD COLUMN reported_at   DATETIME(3) NULL,
  ADD COLUMN report_reason VARCHAR(200) NULL,
  ADD COLUMN deleted_at    DATETIME(3) NULL,
  ADD KEY idx_student_status (status);

-- Who did what and when: logins, logouts, admin actions, account changes. No coordinates, codes or tokens.
CREATE TABLE audit_events (
  event_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id BIGINT UNSIGNED NULL,
  actor_id   BIGINT UNSIGNED NULL,
  event_type VARCHAR(40) NOT NULL,
  detail     VARCHAR(300) NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (event_id),
  KEY idx_audit_student (student_id, created_at),
  KEY idx_audit_time (created_at)
) ENGINE=InnoDB;

-- Words administrators add to the built-in list (name-filter-terms.js).
CREATE TABLE banned_terms (
  term       VARCHAR(60) NOT NULL,
  mode       ENUM('substring', 'token') NOT NULL DEFAULT 'token',
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (term)
) ENGINE=InnoDB;

CREATE TABLE checkpoint_images (
  checkpoint_id BIGINT UNSIGNED NOT NULL,
  position      TINYINT NOT NULL,
  url           VARCHAR(255) NOT NULL,
  alt_text      VARCHAR(200) NOT NULL,
  credit        VARCHAR(200) NOT NULL,
  PRIMARY KEY (checkpoint_id, position),
  CONSTRAINT fk_image_checkpoint FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (checkpoint_id) ON DELETE CASCADE
) ENGINE=InnoDB;
