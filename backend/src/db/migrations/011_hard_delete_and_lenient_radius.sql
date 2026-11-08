-- BR47: a deleted account is gone for good, so no "deleted" status, date or erase marker is kept any more.
-- Accounts that an earlier version only marked as deleted are removed now, with everything that belongs to them.
DELETE x FROM attempt_answers x
  JOIN attempts a ON a.attempt_id = x.attempt_id
  JOIN students s ON s.student_id = a.student_id
  WHERE s.status = 'deleted';
DELETE x FROM attempt_questions x
  JOIN attempts a ON a.attempt_id = x.attempt_id
  JOIN students s ON s.student_id = a.student_id
  WHERE s.status = 'deleted';
DELETE x FROM location_checks x JOIN students s ON s.student_id = x.student_id WHERE s.status = 'deleted';
DELETE x FROM attempts x JOIN students s ON s.student_id = x.student_id WHERE s.status = 'deleted';
DELETE x FROM team_invitations x
  JOIN students s ON s.student_id = x.invitee_id OR s.student_id = x.inviter_id
  WHERE s.status = 'deleted';
DELETE x FROM sessions x JOIN students s ON s.student_id = x.student_id WHERE s.status = 'deleted';
DELETE x FROM audit_events x JOIN students s ON s.student_id = x.student_id WHERE s.status = 'deleted';
DELETE FROM students WHERE status = 'deleted';

ALTER TABLE students
  MODIFY status ENUM('active', 'blocked', 'archived') NOT NULL DEFAULT 'active',
  DROP COLUMN deleted_at,
  DROP COLUMN purged_at;

-- BR12: phones are rarely exact, so no checkpoint circle is smaller than 60 m any more (admins can still change it).
UPDATE checkpoints SET radius = 60 WHERE radius < 60;
