-- Photos that belong to one question (BR11: kept in the database like the questions). `shown` says when the
-- student sees a photo: 'question' with the question (it is needed to answer, e.g. "how many of these lights"),
-- 'answer' only after the question is answered (it would give the answer away, e.g. a room sign).
CREATE TABLE question_images (
  question_id BIGINT UNSIGNED NOT NULL,
  position    TINYINT NOT NULL,
  url         VARCHAR(255) NOT NULL,
  alt_text    VARCHAR(200) NOT NULL,
  credit      VARCHAR(200) NOT NULL,
  shown       ENUM('question', 'answer') NOT NULL DEFAULT 'answer',
  PRIMARY KEY (question_id, position),
  CONSTRAINT fk_question_image_question FOREIGN KEY (question_id) REFERENCES questions (question_id) ON DELETE CASCADE,
  CONSTRAINT ck_question_image_position CHECK (position BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
