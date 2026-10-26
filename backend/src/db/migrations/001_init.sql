-- Campus & City Quest: initial schema (see docs/data-model.md and design/yi_heng/database-schema.md).
-- All timestamps are UTC, DATETIME(3). Generated columns replace the partial unique indexes of other databases.

CREATE TABLE teams (
  team_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_name        VARCHAR(30) NOT NULL,
  profile_picture  VARCHAR(255) NULL,
  created_at       DATETIME(3) NOT NULL,
  team_score       INT NOT NULL DEFAULT 0,
  score_updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (team_id),
  UNIQUE KEY uq_team_name (team_name)
) ENGINE=InnoDB;

CREATE TABLE students (
  student_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id           BIGINT UNSIGNED NULL,
  email             VARCHAR(254) NOT NULL,
  first_name        VARCHAR(50) NOT NULL,
  last_name         VARCHAR(50) NOT NULL,
  nickname          VARCHAR(20) NULL,
  profile_picture   VARCHAR(255) NULL,
  total_points      INT NOT NULL DEFAULT 0,
  points_exact_x100 BIGINT NOT NULL DEFAULT 0,
  points_updated_at DATETIME(3) NOT NULL,
  created_at        DATETIME(3) NOT NULL,
  team_joined_at    DATETIME(3) NULL,
  location_consent_at DATETIME(3) NULL,
  PRIMARY KEY (student_id),
  UNIQUE KEY uq_student_email (email),
  KEY idx_student_team (team_id),
  KEY idx_student_rank (total_points, points_updated_at),
  CONSTRAINT fk_student_team FOREIGN KEY (team_id) REFERENCES teams (team_id) ON DELETE RESTRICT,
  CONSTRAINT ck_student_points CHECK (total_points >= 0 AND points_exact_x100 >= 0)
) ENGINE=InnoDB;

CREATE TABLE otp_codes (
  otp_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email           VARCHAR(254) NOT NULL,
  code_hash       CHAR(64) NOT NULL,
  created_at      DATETIME(3) NOT NULL,
  expires_at      DATETIME(3) NOT NULL,
  is_used         TINYINT(1) NOT NULL DEFAULT 0,
  failed_attempts INT NOT NULL DEFAULT 0,
  PRIMARY KEY (otp_id),
  KEY idx_otp_email (email, created_at)
) ENGINE=InnoDB;

CREATE TABLE sessions (
  session_id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id     BIGINT UNSIGNED NOT NULL,
  token_hash     CHAR(64) NOT NULL,
  created_at     DATETIME(3) NOT NULL,
  last_active_at DATETIME(3) NOT NULL,
  expires_at     DATETIME(3) NOT NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  active_student_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_active = 1, student_id, NULL)) STORED,
  PRIMARY KEY (session_id),
  UNIQUE KEY uq_session_token (token_hash),
  UNIQUE KEY uq_one_active_session (active_student_id),
  CONSTRAINT fk_session_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE checkpoints (
  checkpoint_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  checkpoint_name      VARCHAR(60) NOT NULL,
  longitude            DECIMAL(9,6) NOT NULL,
  latitude             DECIMAL(9,6) NOT NULL,
  radius               INT NOT NULL,
  is_active            TINYINT(1) NOT NULL DEFAULT 0,
  question_count       TINYINT NOT NULL,
  pass_threshold       TINYINT NOT NULL,
  hard_question_enabled TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (checkpoint_id),
  UNIQUE KEY uq_checkpoint_name (checkpoint_name),
  CONSTRAINT ck_checkpoint CHECK (
    radius > 0 AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
    AND question_count IN (3, 5) AND pass_threshold BETWEEN 1 AND question_count
  )
) ENGINE=InnoDB;

CREATE TABLE scoring_multiplier (
  attempt_number INT NOT NULL,
  percentage     INT NOT NULL,
  PRIMARY KEY (attempt_number),
  CONSTRAINT ck_multiplier CHECK (attempt_number >= 1 AND percentage BETWEEN 0 AND 100)
) ENGINE=InnoDB;

CREATE TABLE bonus (
  bonus_type     VARCHAR(20) NOT NULL,
  points_awarded INT NOT NULL,
  PRIMARY KEY (bonus_type),
  CONSTRAINT ck_bonus CHECK (points_awarded >= 0)
) ENGINE=InnoDB;

CREATE TABLE difficulty (
  difficulty     VARCHAR(10) NOT NULL,
  points_awarded INT NOT NULL,
  PRIMARY KEY (difficulty),
  CONSTRAINT ck_difficulty CHECK (points_awarded >= 0)
) ENGINE=InnoDB;

CREATE TABLE questions (
  question_id   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  checkpoint_id BIGINT UNSIGNED NOT NULL,
  difficulty    VARCHAR(10) NOT NULL,
  question_text VARCHAR(500) NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (question_id),
  KEY idx_question_pool (checkpoint_id, difficulty, is_active),
  CONSTRAINT fk_question_checkpoint FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (checkpoint_id) ON DELETE RESTRICT,
  CONSTRAINT fk_question_difficulty FOREIGN KEY (difficulty) REFERENCES difficulty (difficulty) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE options (
  option_id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  question_id     BIGINT UNSIGNED NOT NULL,
  option_position TINYINT NOT NULL,
  option_text     VARCHAR(255) NOT NULL,
  is_correct      TINYINT(1) NOT NULL DEFAULT 0,
  correct_question_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_correct = 1, question_id, NULL)) STORED,
  PRIMARY KEY (option_id),
  UNIQUE KEY uq_option_position (question_id, option_position),
  UNIQUE KEY uq_option_question (option_id, question_id),
  UNIQUE KEY uq_one_correct (correct_question_id),
  CONSTRAINT fk_option_question FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE RESTRICT,
  CONSTRAINT ck_option_position CHECK (option_position BETWEEN 1 AND 4)
) ENGINE=InnoDB;

CREATE TABLE attempts (
  attempt_id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id        BIGINT UNSIGNED NOT NULL,
  checkpoint_id     BIGINT UNSIGNED NOT NULL,
  attempt_number    INT NOT NULL,
  start_time        DATETIME(3) NOT NULL,
  expires_at        DATETIME(3) NOT NULL,
  finished_at       DATETIME(3) NULL,
  status            ENUM('active','passed','failed') NOT NULL DEFAULT 'active',
  end_reason        ENUM('completed','expired') NULL,
  hard_unlocked     TINYINT(1) NOT NULL DEFAULT 0,
  correct_count     INT NOT NULL DEFAULT 0,
  base_points       INT NOT NULL DEFAULT 0,
  time_bonus        INT NOT NULL DEFAULT 0,
  full_clear_bonus  INT NOT NULL DEFAULT 0,
  multiplier_percent INT NOT NULL DEFAULT 0,
  points_exact      BIGINT NOT NULL DEFAULT 0,
  points_earned     INT NOT NULL DEFAULT 0,
  active_student_id BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'active', student_id, NULL)) STORED,
  passed_key        VARCHAR(41) GENERATED ALWAYS AS (IF(status = 'passed', CONCAT(student_id, '-', checkpoint_id), NULL)) STORED,
  PRIMARY KEY (attempt_id),
  UNIQUE KEY uq_attempt_number (student_id, checkpoint_id, attempt_number),
  UNIQUE KEY uq_one_active_attempt (active_student_id),
  UNIQUE KEY uq_one_passed_attempt (passed_key),
  KEY idx_attempt_expiry (status, expires_at),
  CONSTRAINT fk_attempt_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE RESTRICT,
  CONSTRAINT fk_attempt_checkpoint FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (checkpoint_id) ON DELETE RESTRICT,
  CONSTRAINT ck_attempt CHECK (
    attempt_number >= 1 AND expires_at > start_time AND time_bonus >= 0 AND full_clear_bonus >= 0
    AND points_earned >= 0 AND points_exact >= 0 AND ((status = 'active') = (finished_at IS NULL))
  )
) ENGINE=InnoDB;

CREATE TABLE attempt_questions (
  attempt_id           BIGINT UNSIGNED NOT NULL,
  question_number      TINYINT NOT NULL,
  question_id          BIGINT UNSIGNED NOT NULL,
  replaced_question_id BIGINT UNSIGNED NULL,
  selected_option_id   BIGINT UNSIGNED NULL,
  answered_at          DATETIME(3) NULL,
  PRIMARY KEY (attempt_id, question_number),
  UNIQUE KEY uq_attempt_question (attempt_id, question_id),
  CONSTRAINT fk_aq_attempt FOREIGN KEY (attempt_id) REFERENCES attempts (attempt_id) ON DELETE RESTRICT,
  CONSTRAINT fk_aq_question FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE RESTRICT,
  CONSTRAINT fk_aq_replaced FOREIGN KEY (replaced_question_id) REFERENCES questions (question_id) ON DELETE RESTRICT,
  CONSTRAINT fk_aq_selected FOREIGN KEY (selected_option_id, question_id) REFERENCES options (option_id, question_id) ON DELETE RESTRICT,
  CONSTRAINT ck_aq CHECK (question_number BETWEEN 1 AND 5 AND ((selected_option_id IS NULL) = (answered_at IS NULL)))
) ENGINE=InnoDB;

CREATE TABLE team_invitations (
  invitation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id       BIGINT UNSIGNED NOT NULL,
  inviter_id    BIGINT UNSIGNED NOT NULL,
  invitee_id    BIGINT UNSIGNED NOT NULL,
  status        ENUM('pending','accepted','rejected','expired','invalid') NOT NULL DEFAULT 'pending',
  created_at    DATETIME(3) NOT NULL,
  expires_at    DATETIME(3) NOT NULL,
  responded_at  DATETIME(3) NULL,
  pending_key   VARCHAR(41) GENERATED ALWAYS AS (IF(status = 'pending', CONCAT(team_id, '-', invitee_id), NULL)) STORED,
  PRIMARY KEY (invitation_id),
  UNIQUE KEY uq_one_pending_invitation (pending_key),
  KEY idx_invitation_invitee (invitee_id, status),
  CONSTRAINT fk_inv_team FOREIGN KEY (team_id) REFERENCES teams (team_id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_inviter FOREIGN KEY (inviter_id) REFERENCES students (student_id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_invitee FOREIGN KEY (invitee_id) REFERENCES students (student_id) ON DELETE RESTRICT,
  CONSTRAINT ck_invitation CHECK (inviter_id <> invitee_id AND expires_at > created_at)
) ENGINE=InnoDB;

-- Only "inside radius yes/no" and a timestamp are stored. Never coordinates, accuracy or failure reasons (R-63).
CREATE TABLE location_checks (
  check_id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id         BIGINT UNSIGNED NOT NULL,
  checkpoint_id      BIGINT UNSIGNED NOT NULL,
  checked_at         DATETIME(3) NOT NULL,
  inside_radius      TINYINT(1) NOT NULL,
  used_by_attempt_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (check_id),
  UNIQUE KEY uq_check_attempt (used_by_attempt_id),
  KEY idx_check_lookup (student_id, checkpoint_id, checked_at),
  CONSTRAINT fk_check_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE RESTRICT,
  CONSTRAINT fk_check_checkpoint FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (checkpoint_id) ON DELETE RESTRICT,
  CONSTRAINT fk_check_attempt FOREIGN KEY (used_by_attempt_id) REFERENCES attempts (attempt_id) ON DELETE SET NULL
) ENGINE=InnoDB;
