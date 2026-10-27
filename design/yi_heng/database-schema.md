# Database schema notes

The executable schema is [backend/src/db/migrations/001_init.sql](../../backend/src/db/migrations/001_init.sql); the entity list and rules are in [docs/data-model.md](../../docs/data-model.md). This file explains the decisions that are not visible from the SQL alone. Diagram: [er-diagram.md](../er-diagram.md).

## Engine and conventions

- MySQL 8.4, InnoDB, `utf8mb4`. Started by Docker Compose (`npm run dev` does it), host port 3307, databases `campusquest` and `campusquest_test`.
- All timestamps are `DATETIME(3)` in UTC. The driver is configured with `timezone: 'Z'`, so a JavaScript `Date` is written and read unchanged.
- Migrations are plain `.sql` files applied in name order by `backend/src/db/migrate.js`; applied files are listed in `schema_migrations`.
- `npm run db:seed` loads the scoring tables (BR11), the 8 pilot checkpoints and placeholder questions. Coordinates, radii and questions in the seed are **placeholders**.

Migration `002_avatar_and_facts.sql` adds `students.avatar_preset` (drawn avatar, 0 to 5) and the table `checkpoint_facts` (the read-first info page, three placeholder facts per checkpoint).

## Rules the database enforces itself

MySQL has no partial unique indexes, so a stored generated column that is `NULL` when the row does not count, plus a unique key on it, is used instead.

| Rule | Mechanism |
|---|---|
| One active session per student (BR03) | `sessions.active_student_id` generated from `is_active`, unique |
| One active attempt per student (R-21) | `attempts.active_student_id`, unique |
| A passed checkpoint is final (BR21) | `attempts.passed_key` = `student-checkpoint` when `status = 'passed'`, unique |
| Attempt numbers never repeat (BR16) | unique `(student_id, checkpoint_id, attempt_number)` |
| One pending invitation per team and invitee | `team_invitations.pending_key`, unique |
| Exactly one correct option per question | `options.correct_question_id`, unique |
| A selected option belongs to the presented question | composite foreign key `(selected_option_id, question_id)` to `options` |
| One verified location check unlocks at most one attempt (R-62) | unique `location_checks.used_by_attempt_id` |
| 3 or 5 questions, threshold within range | `CHECK` on `checkpoints` |
| An active attempt has no end time, a finished one has | `CHECK` on `attempts` |

## Money-like arithmetic

Points are integers (R-02). `attempts.points_exact` holds the exact result in hundredths of a point (`(base + time + full clear) x multiplier percent`); `points_earned` is that value divided by 100, rounded up. `students.points_exact_x100` is the exact sum of all attempts; `students.total_points` is that sum rounded up once, so a student who passes two attempts of 3431.45 and 1755.25 points holds 5187 and not 5188. `teams.team_score` is the rounded-up average of the members' `total_points` (R-50).

## Privacy

`location_checks` has no latitude, longitude, accuracy or failure reason, by design (R-63). Rows older than `LOCATION_RETENTION_DAYS` (default 7) are deleted by the housekeeping job (every 10 minutes). OTP codes and session tokens are stored as hashes (HMAC-SHA-256 with a server secret, and SHA-256 of a 256-bit random token). `otp_codes` older than 24 hours are deleted.

## Locks (concurrency)

- Attempt start, answer, hard acceptance and expiry lock the student row first, then the attempt row.
- Invitation acceptance locks team, then student, then invitation in that order, so two simultaneous accepts of the last free place cannot deadlock. The loser gets `INVITATION_INVALID`.
