-- BR52, BR55: settings an administrator can change at run time (the OTP code preview switch), and a marker that
-- the 8 pilot checkpoints were seeded once, so a later seed never brings back or edits a quest an admin changed.
CREATE TABLE app_settings (
  setting_key   VARCHAR(64)  NOT NULL,
  setting_value VARCHAR(255) NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  updated_by    BIGINT UNSIGNED NULL,
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_setting_actor FOREIGN KEY (updated_by) REFERENCES students (student_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- An existing database already holds the pilot checkpoints (seeded by an earlier version).
INSERT INTO app_settings (setting_key, setting_value, updated_at)
  SELECT 'pilot_checkpoints_seeded', 'true', UTC_TIMESTAMP(3) FROM DUAL
  WHERE EXISTS (SELECT 1 FROM checkpoints);

-- BR54: the order of a team. The leader hand-over follows it, and an administrator can change it.
ALTER TABLE students ADD COLUMN team_position SMALLINT UNSIGNED NULL AFTER team_joined_at;

UPDATE students s
  JOIN (
    SELECT student_id,
           ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY team_joined_at, student_id) AS position
    FROM students WHERE team_id IS NOT NULL
  ) ordered ON ordered.student_id = s.student_id
  SET s.team_position = ordered.position;
