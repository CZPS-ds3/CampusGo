-- Team leader (the person who created the team), cancelled invitations, and erased accounts.

ALTER TABLE teams ADD COLUMN leader_id BIGINT UNSIGNED NULL;

UPDATE teams t SET t.leader_id = (
  SELECT s.student_id FROM students s WHERE s.team_id = t.team_id
  ORDER BY s.team_joined_at, s.student_id LIMIT 1
);

ALTER TABLE teams
  ADD CONSTRAINT fk_team_leader FOREIGN KEY (leader_id) REFERENCES students (student_id) ON DELETE SET NULL;

ALTER TABLE team_invitations
  MODIFY status ENUM('pending', 'accepted', 'rejected', 'expired', 'invalid', 'cancelled') NOT NULL DEFAULT 'pending';

-- An admin deletes an account softly (status 'deleted', data kept, can be restored). Only when the admin
-- confirms again, or when the student deletes the account, are the personal data erased: purged_at records when.
ALTER TABLE students ADD COLUMN purged_at DATETIME(3) NULL;

UPDATE students SET purged_at = deleted_at WHERE status = 'deleted';
