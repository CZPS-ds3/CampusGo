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
| `GET /checkpoints` | – | `{ checkpoints: [{ id, name, latitude, longitude, radius, isActive, questionCount, passThreshold, hardQuestionEnabled, completed, attemptsUsed, nextAttemptNumber, bestScore, facts: [text] }] }` (`facts` are the read-first texts of the info page) (coordinates are public map data, not user data) |
| `POST /checkpoints/:id/location-check` | `{ latitude, longitude, accuracy }` | `200 { outcome }` where outcome is `verified`, `outside_radius`, `poor_accuracy` (accuracy above the limit). Nothing consumes an attempt or starts a timer (BR12). Errors: `409 CHECKPOINT_INACTIVE`, `409 CHECKPOINT_COMPLETED`, `409 ACTIVE_ATTEMPT_EXISTS` (body carries `attemptId`), `403 CONSENT_REQUIRED`, `429`. The client reports `permission_denied`/`unavailable` locally; the server never receives them. Coordinates are never stored. |
| `POST /attempts` | `{ checkpointId }` | `201 { attempt }` (see below). Needs an unused `verified` check ≤ 5 minutes old (`409 LOCATION_NOT_VERIFIED`). Draws the questions, starts the timer. |
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

## Health

`GET /health` → `{ status: "ok" }` (no auth).
