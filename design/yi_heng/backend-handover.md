# Backend handover (2026-10-27)

Yuri is rewriting the backend. The frontend now expects the following from it; everything is already implemented and tested in this repository (`backend/`), so the quickest path is to re-apply these pieces after the pull from preproduction. Rules: [docs/business-rules.md](../../docs/business-rules.md) section 9 (BR26 to BR35, proposals).

## New files (copy as they are)

| File | Purpose |
|---|---|
| `backend/src/db/migrations/005_admin_and_media.sql` | `students.role/status/status_reason/reported_at/report_reason/deleted_at`, tables `audit_events`, `banned_terms`, `checkpoint_images` |
| `backend/src/services/name-filter.js`, `name-filter-terms.js`, `name-rules.js` | German and English name filter (whole-word matching) |
| `backend/src/services/audit.js` | `recordEvent()` for the audit log |
| `backend/src/services/account.js` | `deleteAccount()` (BR30) |
| `backend/src/services/admin.js`, `backend/src/middleware/admin.js` | Admin service and `requireAdmin` |
| `backend/src/db/seed-demo.js` | Fictional demo data (development only) |
| `backend/tests/admin.test.js` | Tests BR26 to BR30 |

## Small edits in existing files

- `config.js`: `adminEmails` from `ADMIN_EMAIL` (comma-separated, default `sekretariat.dski@heilbronn.dhbw.de,dhbw.campus@gmail.com`); `adminEmail` is the first one (main admin, id 1). `auth.js` `mayLogIn()` = school domain or one of these addresses (BR37).
- `services/auth.js`: `role` in `publicStudent`; in `verifyOtp` refuse non-active accounts (`ACCOUNT_UNAVAILABLE`), run the name filter on sign-up, make the admin address an admin, write `login` events; `authenticate` returns null for non-active accounts; `logout` writes a `logout` event.
- `services/teams.js`: name filter on team creation; in `invite` refuse with `TEAM_FULL` when members plus pending invitations are 5 (checked **before** the invitee lookup so R-43 holds); only invite `active` students with role `student`.
- `services/leaderboards.js`: only `status = 'active' AND role = 'student'` students, and only active members count for teams.
- `services/quiz.js`: `listCheckpoints` adds `images`.
- `db/seed.js`: real coordinates, `latitude/longitude/radius` updated on re-seed, `seedImages()` (reads `frontend/src/api/places.json`).
- `app.js`: routes `DELETE /me`, `/admin/*`; zod schemas; services wired with `nameRules`.
- `tests/helpers.js`: reset also clears `audit_events` and `banned_terms`; `tests/teams.test.js` has new invitation-limit tests and the "last place" race now inserts the surplus invitations directly.

## Frontend contract

See [api-documentation.md](api-documentation.md) (sections Account deletion and Admin). The browser mock in `frontend/src/api/mock.js` implements the same shapes.

## Round 4 additions (2026-10-28)

- Migration `006_invitation_email.sql` (`team_invitations.invited_email`); ours is `005_admin_and_media.sql` because Yuri's own `003` and `004` came first.
- New: `services/players.js` (`GET /players/:id`), `services/stats.js` (`GET /admin/stats`), `tests/players.test.js`, `tests/stats.test.js`.
- `services/quiz.js`: `verifyAndStart` and `listCheckpoints` treat `role = 'admin'` as test mode (BR38); `unlock` takes `{ testMode }`; `clearTestHistory`.
- `services/teams.js`: `createInvitation` for `{ email }` or `{ playerId }`, `invitePlayer`, pending list with `invitedEmail` and `displayName`.
- `services/account.js`: refuses to delete an admin. `db/seed.js`: `seedAdmin` (id 1).
- `tests/helpers.js`: `loadConfig({ ...process.env, ... })` so CI can set `TEST_DATABASE_URL`.
- `backend/vitest.config.js`: `pool: 'threads'` (the forked worker crashed now and then on Windows).
- `.gitlab-ci.yml`: new pipeline.

## Round 5 additions (2026-10-29)

- New: `services/team-ranking.js` (`rankedTeams`, `rankOfTeam`, `unrankedReason`, `teamStandingAround`), migration `007_recompute_team_scores.sql`, `tests/team-rules.test.js`, `tests/listen-error.test.js`, `src/listen-error.js`, `tests/geofence-lenient.test.js`.
- `services/teams.js`: `refreshTeamScore` counts only active students; `getMyTeam` adds `ranked` and `hasAdmin`.
- `services/leaderboards.js`, `players.js`, `stats.js`: use the shared ranked-team rule.
- `services/quiz.js`: `getResult` adds `team` (rank and score before and after) and null ranks for admins; solo rank excludes admins and inactive students.
- `services/account.js`: `resetTestPoints`; `app.js`: `POST /me/reset-points`, `GET /me` rank null for admins; `services/admin.js`: a status change recalculates the team score.
- The Python and Playwright suites in `tests/` need the API contract above; run them with `npm run test:all`.

## Round 6 additions (2026-10-29)

- Migrations `008_team_leader_and_account_states.sql`, `009_map_style.sql`, `010_quests_and_question_types.sql` (old local databases need `npm run db:reset`; migration 010 changes `attempts`, `checkpoints`, `questions`, `options`).
- New: `services/checkpoint-admin.js` (quest CRUD, photos, facts, questions, readiness), `services/map-link.js` (Google Maps link reader), `map-area.js` (the shared map bounds), `services/map-style.js`, `pictures.js` `storeQuestPhoto`.
- `services/quiz.js`: question types (`DRAWABLE_QUESTIONS` per type, `drawQuestions` with the mixed guarantee, `answer(..., optionIds)` judged by exact match, `attempt_answers`), the hard question moves to the last slot of N questions, per-quest time limit, attempts keep `question_count` and `pass_threshold`, archived quests are hidden.
- `services/teams.js`: `ensureLeader`, `removeMember`, `cancelInvitation`. `services/account.js`: soft delete, restore, purge, `account_deleted_by_student` event. `services/admin.js`: `restoreUser`, `purgeUser`, `addTeamMember`, `listUsers({ noTeam })`.
- `config.js`: the same resend limits in every environment; `otpPreviewDefault` is the start value of the admin switch *code preview* (BR52, 2026-11-10: `services/settings.js`, `auth.previewCode`, `POST /auth/otp-preview`). `services/teams.js` also has `leave`, `repairTeam`, `renumberTeam` and the team order `TEAM_ORDER` (BR54); `db/seed.js` seeds the pilot checkpoints once (BR55).
- Tests: `map-link`, `checkpoint-admin`, `multi-select`, `team-management`, `deleted-accounts`, `map-style` in `backend/tests/`; `helpers.js` removes quests named `TQ ...` and resets the seeded ones.
