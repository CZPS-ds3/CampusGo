-- Team leader (the person who created the team), cancelled invitations, and erased accounts.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS leader_id BIGINT UNSIGNED NULL;

UPDATE teams t SET t.leader_id = (
  SELECT s.student_id FROM students s WHERE s.team_id = t.team_id
  ORDER BY s.team_joined_at, s.student_id LIMIT 1
);

DROP TABLE IF EXISTS team_invitations;

CREATE TABLE team_invitations (
  invitation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  team_id       BIGINT UNSIGNED NOT NULL,
  inviter_id    BIGINT UNSIGNED NOT NULL,
  invitee_id    BIGINT UNSIGNED NOT NULL,
  status        ENUM('pending', 'accepted', 'rejected', 'expired', 'invalid', 'cancelled') NOT NULL DEFAULT 'pending',
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

-- An admin deletes an account softly (status 'deleted', data kept, can be restored). Only when the admin
-- confirms again, or when the student deletes the account, are the personal data erased: purged_at records when.
ALTER TABLE students ADD COLUMN IF NOT EXISTS purged_at DATETIME(3) NULL;

UPDATE students SET purged_at = deleted_at WHERE status = 'deleted';
