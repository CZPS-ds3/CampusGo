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
