-- Team leader (the person who created the team), cancelled invitations, and erased accounts.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS leader_id BIGINT UNSIGNED NULL;

UPDATE teams t SET t.leader_id = (
  SELECT s.student_id FROM students s WHERE s.team_id = t.team_id
  ORDER BY s.team_joined_at, s.student_id LIMIT 1
);

ALTER TABLE teams
  DROP FOREIGN KEY IF EXISTS fk_team_leader;

ALTER TABLE teams
  ADD CONSTRAINT fk_team_leader FOREIGN KEY (leader_id) REFERENCES students (student_id) ON DELETE SET NULL;

ALTER TABLE team_invitations
  DROP INDEX IF EXISTS uq_one_pending_invitation,
  DROP COLUMN IF EXISTS pending_key;

ALTER TABLE team_invitations
  MODIFY status ENUM('pending', 'accepted', 'rejected', 'expired', 'invalid', 'cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE team_invitations
  ADD COLUMN pending_key VARCHAR(41) GENERATED ALWAYS AS (IF(status = 'pending', CONCAT(team_id, '-', invitee_id), NULL)) STORED,
  ADD UNIQUE KEY uq_one_pending_invitation (pending_key);

-- An admin deletes an account softly (status 'deleted', data kept, can be restored). Only when the admin
-- confirms again, or when the student deletes the account, are the personal data erased: purged_at records when.
ALTER TABLE students ADD COLUMN IF NOT EXISTS purged_at DATETIME(3) NULL;

UPDATE students SET purged_at = deleted_at WHERE status = 'deleted';
