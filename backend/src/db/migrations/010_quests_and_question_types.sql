-- Admin-managed quests (checkpoints with a description, a map link, a time limit and a question-type mode),
-- question types (MCQ and multi-select) and attempts that keep their own question count and pass mark.

ALTER TABLE checkpoints
  ADD COLUMN description VARCHAR(1000) NULL,
  ADD COLUMN map_url VARCHAR(500) NULL,
  ADD COLUMN time_limit_seconds INT NULL,
  ADD COLUMN type_mode ENUM('MCQ_ONLY', 'MULTI_ONLY', 'MIXED') NOT NULL DEFAULT 'MCQ_ONLY',
  ADD COLUMN archived_at DATETIME(3) NULL;

UPDATE checkpoints SET description = CONCAT('PLACEHOLDER description for ', checkpoint_name, '.') WHERE description IS NULL;

ALTER TABLE checkpoints DROP CHECK ck_checkpoint;
ALTER TABLE checkpoints ADD CONSTRAINT ck_checkpoint CHECK (
  radius BETWEEN 10 AND 500
  AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180
  AND question_count BETWEEN 1 AND 10
  AND pass_threshold BETWEEN 1 AND question_count
  AND (time_limit_seconds IS NULL OR time_limit_seconds BETWEEN 10 * question_count AND 600 * question_count)
  AND (hard_question_enabled = 0 OR (question_count >= 4 AND pass_threshold <= question_count - 1))
  AND (type_mode <> 'MIXED' OR question_count >= 3)
);

-- A question is single choice (MCQ: exactly one right option) or multi-select (MULTI: two or three right options).
-- The count of right options is enforced by the admin service and by the draw query, not by an index any more.
ALTER TABLE questions ADD COLUMN question_type ENUM('MCQ', 'MULTI') NOT NULL DEFAULT 'MCQ';
ALTER TABLE options DROP INDEX uq_one_correct;
ALTER TABLE options DROP COLUMN correct_question_id;

-- An attempt keeps the question count and pass mark it was started with, so a later edit of the quest cannot change
-- how a running or finished attempt is judged.
ALTER TABLE attempts ADD COLUMN question_count TINYINT NULL, ADD COLUMN pass_threshold TINYINT NULL;
UPDATE attempts a JOIN checkpoints c ON c.checkpoint_id = a.checkpoint_id
  SET a.question_count = c.question_count, a.pass_threshold = c.pass_threshold;
ALTER TABLE attempts MODIFY question_count TINYINT NOT NULL, MODIFY pass_threshold TINYINT NOT NULL;

ALTER TABLE attempt_questions DROP CHECK ck_aq;
ALTER TABLE attempt_questions ADD CONSTRAINT ck_aq CHECK (
  question_number BETWEEN 1 AND 10 AND ((selected_option_id IS NULL) = (answered_at IS NULL))
);
ALTER TABLE attempt_questions ADD COLUMN is_correct TINYINT(1) NULL;
UPDATE attempt_questions aq JOIN options o ON o.option_id = aq.selected_option_id SET aq.is_correct = o.is_correct;

-- Every option the student ticked (one row for MCQ, several for multi-select).
-- attempt_questions.selected_option_id keeps the first one of them.
CREATE TABLE attempt_answers (
  attempt_id      BIGINT UNSIGNED NOT NULL,
  question_number TINYINT NOT NULL,
  question_id     BIGINT UNSIGNED NOT NULL,
  option_id       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (attempt_id, question_number, option_id),
  CONSTRAINT fk_answer_slot FOREIGN KEY (attempt_id, question_number) REFERENCES attempt_questions (attempt_id, question_number),
  CONSTRAINT fk_answer_option FOREIGN KEY (option_id, question_id) REFERENCES options (option_id, question_id)
) ENGINE=InnoDB;

INSERT INTO attempt_answers (attempt_id, question_number, question_id, option_id)
  SELECT attempt_id, question_number, question_id, selected_option_id FROM attempt_questions
  WHERE selected_option_id IS NOT NULL;
