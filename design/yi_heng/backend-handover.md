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

- `config.js`: `adminEmail` (`ADMIN_EMAIL`, default `sekretariat.dski@heilbronn.dhbw.de`).
- `services/auth.js`: `role` in `publicStudent`; in `verifyOtp` refuse non-active accounts (`ACCOUNT_UNAVAILABLE`), run the name filter on sign-up, make the admin address an admin, write `login` events; `authenticate` returns null for non-active accounts; `logout` writes a `logout` event.
- `services/teams.js`: name filter on team creation; in `invite` refuse with `TEAM_FULL` when members plus pending invitations are 5 (checked **before** the invitee lookup so R-43 holds); only invite `active` students with role `student`.
- `services/leaderboards.js`: only `status = 'active' AND role = 'student'` students, and only active members count for teams.
- `services/quiz.js`: `listCheckpoints` adds `images`.
- `db/seed.js`: real coordinates, `latitude/longitude/radius` updated on re-seed, `seedImages()` (reads `frontend/src/api/places.json`).
- `app.js`: routes `DELETE /me`, `/admin/*`; zod schemas; services wired with `nameRules`.
- `tests/helpers.js`: reset also clears `audit_events` and `banned_terms`; `tests/teams.test.js` has new invitation-limit tests and the "last place" race now inserts the surplus invitations directly.

## Frontend contract

See [api-documentation.md](api-documentation.md) (sections Account deletion and Admin). The browser mock in `frontend/src/api/mock.js` implements the same shapes.
