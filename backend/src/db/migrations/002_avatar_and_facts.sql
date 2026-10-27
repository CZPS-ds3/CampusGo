-- Player avatar presets (picked at sign-up) and the "read first" facts shown before a quiz (Should item, R-62).
ALTER TABLE students ADD COLUMN avatar_preset TINYINT NULL;

CREATE TABLE checkpoint_facts (
  checkpoint_id BIGINT UNSIGNED NOT NULL,
  position      TINYINT NOT NULL,
  fact_text     VARCHAR(300) NOT NULL,
  PRIMARY KEY (checkpoint_id, position),
  CONSTRAINT fk_fact_checkpoint FOREIGN KEY (checkpoint_id) REFERENCES checkpoints (checkpoint_id) ON DELETE CASCADE,
  CONSTRAINT ck_fact_position CHECK (position BETWEEN 1 AND 5)
) ENGINE=InnoDB;
