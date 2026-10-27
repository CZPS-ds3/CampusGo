# Traceability Matrix

Which business rule is **designed, built and tested** where. Rule texts: [business-rules.md](business-rules.md). Work-package codes: [project_handbook.md](project_handbook.md) §2. Acceptance check numbers: [business-rules.md](business-rules.md) §8. Entities: [data-model.md](data-model.md).

Keep this file up to date: every merge request names the BR IDs it implements (issue template "Business rules covered"), and every test names its BR ID.

| Rule | Summary | WBS (build) | Entities | Test |
|---|---|---|---|---|
| BR01 | Login only by OTP to a school e-mail (`heilbronn.dhbw.de`) | 3.1, 3.6 | Student, OTP_Code, Session | Unit + API; acceptance checks 1, 2, 3 |
| BR02 | Sign-up with first/last name, optional picture, nickname | 3.2, 3.6 | Student | API + UI; validation tests (business-rules §5) |
| BR03 | One active session; inactivity expiry | 3.1 | Session | API; acceptance check 4 |
| BR04 | Solo and team leaderboards; team average; round up; team board only for team members | 3.4, 3.8 | Student, Team, Attempt | Unit (rounding); API (403); acceptance checks 19, 24 |
| BR05 | Teams of 1-5; one team per user; ≥2 members active; name required | 3.2, 3.6 | Team, Student | API; acceptance checks 16, 19 |
| BR06 | Invitations: accept/reject, invalid on reject/full, 24 h expiry, not for users in a team | 3.2, 3.6 | Team_Invitation, Team, Student | API + concurrency; acceptance checks 16, 17, 18 |
| BR07 | Eight pilot checkpoints | 4.1 | Checkpoint (seed) | Seed validation |
| BR08 | Checkpoint: unique name, GPS, positive radius, is_active; only active unlock quizzes | 3.5, 4.1 | Checkpoint | DB constraints; API (`CHECKPOINT_INACTIVE`) |
| BR09 | Random 3 or 5 distinct questions; bank size; fresh draw per attempt | 3.3, 4.2 | Checkpoint, Question, Attempt_Question | Unit (distinctness); seed validation; acceptance check 25 |
| BR10 | One checkpoint per question; 4 options; 1 correct | 3.3, 4.2 | Question, Option | DB constraints; seed validation |
| BR11 | Content and points maintained in the database, not in code | 2.2, 3.3, 3.4, 4.2 | Difficulty, Bonus, Scoring_Multiplier, Question, Option | Test: change a value in the DB, no code change |
| BR12 | Location check at every attempt start; poor accuracy/denied = retry without consuming attempt; leaving afterwards is allowed | 3.5, 3.7 | Checkpoint, Location_Check (proposed), Attempt | API; acceptance checks 5, 6, 22; real-phone test |
| BR13 | Time limit 1 min per question, starting when the quiz unlocks | 3.3, 3.7 | Attempt | Unit + clock tests; acceptance check 7 |
| BR14 | Wrong = 0 points, right answer revealed, no retry | 3.3, 3.7 | Attempt_Question, Option | API; acceptance checks 8, 9 |
| BR15 | Pass at 4/5 or 2/3; otherwise checkpoint stays incomplete | 3.3 | Attempt, Checkpoint | Unit |
| BR16 | Points credited at the end; expired attempt scores only if the threshold is met | 3.4 | Attempt, Student, Team | Unit; acceptance checks 21, 24 |
| BR17 | Time bonus: 1 point per whole remaining second | 3.4 | Attempt, Bonus | Unit; examples in business-rules §3.3 |
| BR18 | Full clear bonus 200 when all questions are correct | 3.4 | Attempt, Bonus | Unit; examples in business-rules §3.3 |
| BR19 | Multipliers for attempts 2-5 after bonuses; attempt 6+ = 0 points | 3.4 | Attempt, Scoring_Multiplier | Unit; acceptance check 14 |
| BR20 | Attempt 1 only: first four correct unlocks hard replacement of question 5 | 3.3, 3.7 | Attempt (hard_unlocked), Attempt_Question | Unit + API; acceptance check 10 |
| BR21 | Hard question 2,000 / 0; wrong forfeits only full clear | 3.3, 3.4 | Attempt, Attempt_Question, Difficulty | Unit; acceptance check 11 |
| BR22 | Server accepts answers only while active and before expiry | 3.3 | Attempt, Attempt_Question | API clock tests; acceptance check 7 |
| BR23 | Passed attempts read-only; new attempt = new record; checkpoint completed once | 3.3 | Attempt | DB constraints; acceptance checks 13, 15 |
| BR24 | Equal scores share a rank; earlier achiever listed first | 3.4, 3.8 | Student, Team | Unit; acceptance check 20 |
| BR25 | Questions stay unchanged after refresh/reconnect; server keeps sequence and history | 3.3, 3.7 | Attempt, Attempt_Question | API; acceptance checks 12, 23 |

## Status tracking

Track Designed / Built / Tested per rule with GitLab issue labels (`br::BR01` ... `br::BR25`) or add a column per milestone here. The final report shows this matrix as the requirement-to-test traceability.

## Automated tests by file

Run with `npm test` (backend and frontend) and `npm run test:e2e` (browser). Every test name starts with or contains the BR id, or "check N" for the acceptance checks of [business-rules.md](business-rules.md) §8.

| File | What it proves | Rules and checks |
|---|---|---|
| `backend/tests/scoring.test.js` | The 15 worked examples of §3.3 exactly, integer rounding, team average, ranks 1-1-3, values read from the table passed in | BR04, BR11, BR14, BR16-BR21; checks 21, 24 |
| `backend/tests/auth.test.js` | Avatar preset at sign-up and later (0 to 5 only), domain rule (three bad and three good addresses), identical answer for known and unknown address, OTP hash storage, lock after 5 failures, expiry, reuse, one session per student, inactivity expiry, token hash, picture type and size | BR01-BR03; checks 1-4 |
| `backend/tests/quiz.test.js` | Read-first facts and best score, rank before and after a result, eight checkpoints, inactive checkpoint, poor accuracy and outside radius use no attempt, no coordinates stored, start gate, 3/5 distinct questions and deadlines, bank limit, simultaneous starts, resume after new login, right answer revealed only after a wrong one, wrong order, double submit, expiry at ±1 ms, examples 1, 2, 3, 5, 8, 9, 7 through the API, hard offer rules, refresh keeps state, completed checkpoint is final, solo ranking ties | BR07-BR09, BR12-BR25; checks 5-15, 20, 22, 23, 25 |
| `backend/tests/teams.test.js` | Pending invitations show only an expiry (never the invitee address), team creation and uniqueness, invitations (accept, reject, expiry at exactly 24 h, generic answer, other people's invitations), last free place race, invalidation on team creation or acceptance, team board access, team score, team ranking ties, no e-mail or last name shown to others | BR04-BR06, BR24; checks 16-20 |
| `frontend/tests/otp.test.jsx` | OTP boxes: auto-advance, paste, Backspace, only digits, six digits | BR01 |
| `frontend/tests/menu.test.jsx` | Round menu: five stones, current page marked, page behind inert, Escape, arrow keys, Tab trap, scrim | UI spec |
| `frontend/tests/timer.test.jsx` | Server-driven countdown, clock skew correction, no "expired" flash | BR13, BR22 |
| `frontend/tests/i18n.test.js` | German and English by key, fallback to English, theme / language / font size written to the page, and every text in the app has a German translation | UI (campusGO prototype) |
| `frontend/tests/mock-api.test.js` | The in-browser mock follows the same rules (domain, location gate, 5 distinct questions, reveal, full clear, final checkpoint, team board closed) | BR02, BR06, BR12-BR14, BR18, BR21 |
| `frontend/e2e/*.spec.js` | Whole journey on 6 screen sizes (360, 390, 430, 768, 1024, 1280 px wide), no sideways scrolling, menu by mouse and keyboard, wrong answer, refresh, poor accuracy, far away | BR12, BR14, BR25, UI spec |
| `frontend/e2e-fullstack/smoke.spec.js` | Sign-up with a real code, check-in, quiz and ranking through Vite, Express and MySQL | BR01, BR12, BR16, BR24 |

Not automated yet: check 22 for log files (reviewed in code: the error handler never logs bodies), the real-phone location test, and the time-zone behaviour of the production server.
