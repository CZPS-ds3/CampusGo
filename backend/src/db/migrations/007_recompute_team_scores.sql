-- Team score = average of the active students' totals, rounded up (BR43). One-off correction of the stored values.
UPDATE teams t SET t.team_score = COALESCE((
  SELECT CEIL(AVG(s.total_points)) FROM students s
  WHERE s.team_id = t.team_id AND s.status = 'active' AND s.role = 'student'
), 0);
