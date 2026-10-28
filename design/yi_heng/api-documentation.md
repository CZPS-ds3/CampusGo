# API Documentation

Base path `/api`. JSON in and out (UTF-8). Authentication: HttpOnly cookie `cq_session` (set by `POST /api/auth/verify`). In development the frontend uses the Vite proxy, so the cookie is same-origin. Errors always look like `{ "error": { "code": "SOME_CODE", "message": "Human readable text" } }`.
Rule references (BRxx, R-nn) point to [docs/business-rules.md](../../docs/business-rules.md).

Status codes: 400 invalid input · 401 no valid session · 403 not allowed · 404 not found / not yours · 409 state conflict · 429 rate limited · 500/503 server fault.

## Auth (BR01–BR03)

| Method + path | Body | Response |
|---|---|---|
| `POST /auth/request-otp` | `{ email }` | **Always** `200 { message: "If the account exists, an email containing the OTP has been sent." }` for a well-formed school address (R-32). `400 INVALID_EMAIL` if malformed or not ending with `heilbronn.dhbw.de`. `429` when rate limited. |
| `POST /auth/verify` | `{ email, otp, firstName?, lastName?, nickname?, avatarPreset? }` | Existing student: `200 { status: "ok", student }` + cookie. Unknown e-mail without names: `200 { status: "profile_required" }` (OTP not used). Unknown e-mail with names: creates the student, `201 { status: "ok", student }` + cookie. Wrong/expired/used/locked: `400 INVALID_CODE` (one identical message). A new login ends every older session (BR03). |
| `POST /auth/logout` | – | `204`, clears the cookie |
| `GET /me` | – | `{ student: { id, email, firstName, lastName, nickname, displayName, pictureUrl, avatarPreset, totalPoints, rank, teamId, locationConsent } }` (`rank` = solo rank, ties share a rank) |
| `POST /me/picture` | multipart `file` (png/jpg/webp, ≤ 2 MB) | `200 { pictureUrl }`; `400 INVALID_IMAGE` / `413` |
| `POST /me/avatar-preset` | `{ preset }` (0 to 5) | `204`; removes the uploaded picture |
| `POST /me/location-consent` | – | `204` (stores the consent time, R-63) |
| `GET /dev/last-otp?email=` | – | **Development only** (`NODE_ENV=development`), `404` otherwise |

## Checkpoints, location and attempts (BR07–BR25)

| Method + path | Body | Response |
|---|---|---|
| `GET /checkpoints` | – | Active checkpoints only (BR08): `{ checkpoints: [{ id, name, latitude, longitude, radius, isActive, questionCount, passThreshold, hardQuestionEnabled, completed, attemptsUsed, nextAttemptNumber, bestScore, facts: [text] }] }` (`facts` are the read-first texts of the info page) (coordinates are public map data, not user data) |
| `POST /checkpoints/:id/verify` | `{ lat, lng, accuracy, ageMs }` | Geofence check **and** unlock in one call (Main Project Document 6.2, see [docs/geofencing.md](../../docs/geofencing.md)). `200 { status: 'OK', resumed, attempt }` when inside (creates the attempt, draws the questions, starts the timer) or when an attempt for this checkpoint is already running (BR25, no location needed). `200 { status: 'OUTSIDE', distanceM, elsewhere, message }` when outside (distance rounded to 10 m), or when the reading is inside this circle but another active checkpoint with a nearer centre also contains it (`elsewhere` is that checkpoint's name, otherwise `null`). Errors, none of which uses an attempt or starts a timer: `400 INVALID_INPUT`, `404 NOT_AVAILABLE`, `409 ALREADY_COMPLETED`, `409 ACTIVE_ATTEMPT_EXISTS` (body carries `attemptId`), `403 CONSENT_REQUIRED`, `422 STALE_POSITION` (reading older than 30 s), `422 ACCURACY_TOO_LOW` (worse than 50 m), `429 TOO_MANY` (10 per minute per student), `503 DRAW_IMPOSSIBLE`. Coordinates are never stored or logged. |
| `GET /attempts/:id` | – | `{ attempt }` for an own attempt (finalises it first if its deadline has passed); `404` for anyone else's |
| `GET /attempts/active` | – | `{ attempt }` or `{ attempt: null }` (resume, BR25; lazily finalises an expired attempt) |
| `POST /attempts/:id/answers` | `{ optionId }` | `200 { correct, correctOptionId?, attempt }`; if the attempt just ended the response also has `result`. Errors: `409 ATTEMPT_NOT_ACTIVE`, `409 ATTEMPT_EXPIRED`, `409 ALREADY_ANSWERED`, `400 INVALID_OPTION`, `404`. |
| `POST /attempts/:id/hard` | – | `200 { attempt }` – replaces question 5 by a hard question (BR20). `409 HARD_NOT_AVAILABLE` otherwise. |
| `GET /attempts/:id/result` | – | Finished attempt: `{ result }` (own attempts only) |

`attempt` object: `{ id, checkpointId, checkpointName, attemptNumber, multiplierPercent, status, startTime, expiresAt, serverNow, questionCount, passThreshold, hardUnlocked, hardAccepted, currentQuestion, questions: [{ number, id, text, difficulty, options: [{ id, position, text }], selectedOptionId, answered, correctOptionId? }] }`. `correctOptionId` is only present for questions that were already answered **wrongly** (BR14). `serverNow` lets the client correct clock skew.

`result` object: `{ attemptId, passed, status, endReason, correctCount, questionCount, passThreshold, basePoints, timeBonus, fullClearBonus, multiplierPercent, pointsEarned, totalPoints, rankBefore, rankAfter, nextMultiplierPercent, checkpointCompleted, nextAttemptNumber }`.

## Teams and invitations (BR05, BR06)

| Method + path | Body | Response |
|---|---|---|
| `GET /teams/me` | – | `{ team: { id, name, pictureUrl, members: [{ id, displayName, pictureUrl, avatarPreset, totalPoints }], pending: [{ expiresAt }], size, score, active } }` (pending invitations show only their expiry, never the invitee) or `{ team: null }` |
| `POST /teams` | `{ name }` | `201 { team }`; `409 ALREADY_IN_TEAM`; `409 TEAM_NAME_TAKEN` |
| `POST /teams/me/picture` | multipart `file` | `200 { pictureUrl }` |
| `POST /teams/me/invitations` | `{ email }` | Always `202 { message: "If the user exists and can be invited, an invitation has been sent." }` (R-43) |
| `GET /invitations` | – | `{ invitations: [{ id, teamName, inviterName, expiresAt, status }] }` (pending only) |
| `POST /invitations/:id/accept` | – | `200 { team }`; `409 INVITATION_INVALID` (expired / full / already in team) |
| `POST /invitations/:id/reject` | – | `204` |

## Leaderboards (BR04, BR24)

| Method + path | Response |
|---|---|
| `GET /leaderboards/solo?limit=` | `{ entries: [{ rank, id, displayName, pictureUrl, avatarPreset, points, isYou }], you: { rank, points } }` |
| `GET /leaderboards/team` | `403 NO_TEAM` for students without a team; otherwise `{ entries: [{ rank, id, name, pictureUrl, points, members, isYourTeam }], yourTeam: { rank, points } \| null }` (only teams with ≥ 2 members are listed) |

## Account deletion (BR30)

| Endpoint | Body | Result |
|---|---|---|
| `DELETE /me` | none | `204`, session cookie cleared. `403 FORBIDDEN` for admins. |

## Admin (BR26 to BR31; role `admin`, else `403 FORBIDDEN`)

| Endpoint | Body / query | Result |
|---|---|---|
| `GET /admin/overview` | none | `{ users: { active, blocked, archived, deleted }, activeSessions, questsPassedToday, loginsToday, teams }` |
| `GET /admin/users` | `?q=&status=active\|blocked\|archived\|deleted\|reported&limit=&offset=` | `{ users: [{ id, email, firstName, lastName, nickname, role, status, statusReason, reported, reportReason, teamName, totalPoints, questsPassed, createdAt, lastLoginAt }] }` |
| `POST /admin/users` | `{ email, firstName, lastName, nickname? }` | `201 { user }`; `409 EMAIL_TAKEN`, `400 NAME_NOT_ALLOWED`, `400 INVALID_EMAIL` |
| `GET /admin/users/:id` | none | `{ user, sessions: [{ id, startedAt, lastActiveAt, active }], attempts: [{ checkpoint, attemptNumber, startedAt, status, points }], events: [{ type, detail, at, byAdmin }] }` |
| `PATCH /admin/users/:id` | any of `email, firstName, lastName, nickname` | `{ user }` |
| `POST /admin/users/:id/status` | `{ status: active\|blocked\|archived, reason? }` | `{ user }`; ends all sessions unless `active` |
| `POST /admin/users/:id/report` / `DELETE` | `{ reason }` / none | `{ user }` |
| `POST /admin/users/:id/logout` | none | `204` (all sessions end) |
| `DELETE /admin/users/:id` | none | `204` (same anonymisation as BR30) |
| `GET /admin/teams` | none | `{ teams: [{ id, name, score, size, members: [{ id, displayName }] }] }` |
| `PATCH /admin/teams/:id` | `{ name }` | `204`; `400 NAME_NOT_ALLOWED`, `409 TEAM_NAME_TAKEN` |
| `DELETE /admin/teams/:id/members/:studentId`, `DELETE /admin/teams/:id` | none | `204` |
| `GET /admin/names` | none | `{ builtIn: { substring, token }, custom: [{ term, mode }] }` |
| `POST /admin/names`, `DELETE /admin/names/:term` | `{ term, mode: token\|substring }` | `204` |
| `POST /admin/names/test` | `{ text }` | `{ blockedBy: term \| null }` |

Other changes: `GET /checkpoints` adds `images: [{ url, alt, credit }]`; `POST /teams/me/invitations` answers `409 TEAM_FULL` when members plus open invitations are 5; `POST /auth/verify` answers `403 ACCOUNT_UNAVAILABLE` for blocked or archived accounts and `400 NAME_NOT_ALLOWED` for a banned name; the student object has `role`.

## Health

`GET /health` → `{ status: "ok" }` (no auth).
