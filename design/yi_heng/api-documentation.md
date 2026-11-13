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

## Players and invitations (BR36, BR40)

| Endpoint | Body | Result |
|---|---|---|
| `GET /players/:id` | none | `{ player: { id, displayName, pictureUrl, avatarPreset, totalPoints, rank, questsCleared, isYou, canInvite, team: { id, name, pictureUrl, score, rank, members: [{ id, displayName, pictureUrl, avatarPreset, totalPoints }] } \| null } }`; `404` for blocked, archived, deleted and admin accounts |
| `POST /teams/me/invitations` | `{ email }` **or** `{ playerId }` (exactly one) | `202` with the generic message |

`GET /teams/me` pending entries are now `{ expiresAt, invitedEmail \| null, displayName }`. `POST /checkpoints/:id/verify` and `GET /checkpoints` behave differently for admins (BR38): all checkpoints are listed and any quiz starts without a location.

## Admin points and team ranking (BR41 to BR43)

| Endpoint | Body | Result |
|---|---|---|
| `POST /me/reset-points` | none | `200 { totalPoints: 0 }`; `403 FORBIDDEN` for students. Deletes the admin's own attempts, answers and location checks. |

`GET /me` returns `rank: null` for admins. The `result` object of `GET /attempts/:id/result` has `rankBefore` and `rankAfter` (both `null` for admins) and, for a student in a ranked team, `team: { teamName, teamScoreBefore, teamScoreAfter, teamRankBefore, teamRankAfter }` (otherwise `team: null`; admins get no `team` field). `GET /teams/me` adds `ranked` (two active students, no admin) and `hasAdmin`.

## Account deletion (BR30)

| Endpoint | Body | Result |
|---|---|---|
| `DELETE /me` | none | `204`, session cookie cleared. `403 FORBIDDEN` for admins. |

## Admin (BR26 to BR31; role `admin`, else `403 FORBIDDEN`)

| Endpoint | Body / query | Result |
|---|---|---|
| `GET /admin/stats` | none | dashboard numbers, see [admin-dashboard-spec.md](admin-dashboard-spec.md) section 2 |
| `GET /admin/overview` | none | `{ users: { active, blocked, archived }, admins, activeSessions, questsPassedToday, loginsToday, teams }` |
| `GET /admin/users` | `?q=&status=active\|blocked\|archived\|reported&role=student\|admin&limit=&offset=` | `{ users: [{ id, email, firstName, lastName, nickname, role, status, statusReason, reported, reportReason, teamName, totalPoints, questsPassed, createdAt, lastLoginAt }] }` |
| `POST /admin/users` | `{ email, firstName, lastName, nickname?, role?: student\|admin }` | `201 { user }`; `409 EMAIL_TAKEN`, `400 NAME_NOT_ALLOWED`, `400 INVALID_EMAIL` |
| `GET /admin/users/:id` | none | `{ user, sessions: [{ id, startedAt, lastActiveAt, active }], attempts: [{ checkpoint, attemptNumber, startedAt, status, points }], events: [{ type, detail, at, byAdmin }] }` |
| `PATCH /admin/users/:id` | any of `email, firstName, lastName, nickname` | `{ user }` |
| `POST /admin/users/:id/status` | `{ status: active\|blocked\|archived, reason? }` | `{ user }`; ends all sessions unless `active` |
| `POST /admin/users/:id/report` / `DELETE` | `{ reason }` / none | `{ user }` |
| `POST /admin/users/:id/logout` | none | `204` (all sessions end) |
| `DELETE /admin/users/:id` | none | `204`. **Deleted for good (BR47):** the account, its sessions, invitations, quiz history and log are removed and the team is repaired; no restore. `403` for an administrator, `404` when it does not exist |
| `POST /admin/users/:id/role` | `{ role: student\|admin }` | `{ user }` (BR53). Takes effect on the next request; the person leaves their team and quiz history and points are cleared. `403` for your own account and the main administrator, `404`, `400` for an unknown role |
| `POST /admin/teams/:id/members` | `{ studentId }` | `204`; `404`, `409 NOT_A_STUDENT \| STUDENT_NOT_ACTIVE \| ALREADY_IN_TEAM \| TEAM_FULL` (BR46) |
| `GET /admin/users?noTeam=1` | `q` too | only active students without a team (for the add-member pop-up) |
| `GET /admin/teams` | none | `{ teams: [{ id, name, score, size, members: [{ id, displayName }] }] }` |
| `PATCH /admin/teams/:id` | `{ name }` | `204`; `400 NAME_NOT_ALLOWED`, `409 TEAM_NAME_TAKEN` |
| `DELETE /admin/teams/:id/members/:studentId`, `DELETE /admin/teams/:id` | none | `204` |
| `GET /admin/names` | none | `{ builtIn: { substring, token }, custom: [{ term, mode }] }` |
| `POST /admin/names`, `DELETE /admin/names/:term` | `{ term, mode: token\|substring }` | `204` |
| `POST /admin/names/test` | `{ text }` | `{ blockedBy: term \| null }` |

Other changes: `GET /checkpoints` adds `images: [{ url, alt, credit }]`; `POST /teams/me/invitations` answers `409 TEAM_FULL` when members plus open invitations are 5; `POST /auth/verify` answers `403 ACCOUNT_UNAVAILABLE` for blocked or archived accounts and `400 NAME_NOT_ALLOWED` for a banned name; the student object has `role`.

## Health

`GET /health` → `{ status: "ok" }` (no auth).

## Team leader and invitations (BR44, BR45)

| Endpoint | Body | Result |
|---|---|---|
| `DELETE /teams/me/members/:studentId` | none | `200 { team }`. `403 NOT_LEADER` for other members, `400` when the leader names themselves, `404` for someone who is not in the team |
| `POST /teams/me/invitations/:id/cancel` | none | `200 { team }`; any member of the team; `404` when the invitation is not pending |

`GET /teams/me` adds `leaderId` and an `id` for every pending entry.

## Map style (BR48)

| Endpoint | Body | Result |
|---|---|---|
| `GET /me/map-style` | none | `{ style }` (the default when none is saved) |
| `PUT /me/map-style` | `{ preset?, base?: follow\|light\|dark, tint?: { color, strength 0-100 }, pins?: { open, done, locked }, highlight?, route? }` | `{ style }` with colours as `#rrggbb`; `400 INVALID_MAP_STYLE` with `problems: []` |
| `DELETE /me/map-style` | none | `{ style }` (the default) |

## Quests (admin, BR49 to BR51)

| Endpoint | Body | Result |
|---|---|---|
| `GET /admin/checkpoints` | none | `{ quests: [{ id, name, description, mapUrl, lat, lng, radius, questionCount, passThreshold, timeLimitSeconds, effectiveTimeLimitSeconds, hardQuestionEnabled, typeMode, isActive, archived, readiness: { ready, problems[] }, counts: { questions, photos, facts }, hasHistory }] }` |
| `POST /admin/checkpoints/check-link` | `{ mapLink }` | `{ lat, lng, url, warnings[] }` or `400 INVALID_MAP_LINK` with `reason` (`EMPTY`, `TOO_LONG`, `NOT_A_LINK`, `NOT_HTTPS`, `NOT_GOOGLE_MAPS`, `SHORT_LINK_FAILED`, `NO_COORDINATES`, `BAD_COORDINATES`, `OUTSIDE_MAP_AREA` + `area`) |
| `POST /admin/checkpoints` | `{ name, mapLink, questionCount, passThreshold, description?, radius?, timeLimitSeconds?, hardQuestionEnabled?, typeMode? }` | `201 { quest, facts, photos, questions, warnings }`; created inactive; `400 INVALID_QUEST \| INVALID_MAP_LINK`, `409 NAME_TAKEN` |
| `GET /admin/checkpoints/:id` | none | `{ quest, facts[], photos: [{ position, url, alt, credit }], questions: [{ id, difficulty, type, text, isActive, options: [{ id, position, text, isCorrect }] }] }` |
| `PATCH /admin/checkpoints/:id` | any of the create fields and `isActive` | same as above; `409 QUEST_NOT_READY` (with `problems`) when switched on too early, `409 QUEST_ARCHIVED` |
| `DELETE /admin/checkpoints/:id` | none | `{ result: archived \| erased }` |
| `POST /admin/checkpoints/:id/restore` | none | the quest again (inactive); `409 NOT_ARCHIVED` |
| `PUT /admin/checkpoints/:id/facts` | `{ facts: [text] }` (at most 5) | the quest |
| `POST /admin/checkpoints/:id/photos` | multipart `file`, `alt`, `credit` | `201` the quest (at most 5 photos; PNG, JPG or WebP, stored as 1280 x 720 WebP) |
| `PATCH` / `DELETE /admin/checkpoints/:id/photos/:position` | `{ alt?, credit? }` / none | the quest |
| `POST /admin/checkpoints/:id/questions` | `{ questionText, difficulty: NORMAL\|HARD, questionType: MCQ\|MULTI, isActive?, options: [4 x { text, isCorrect }] }` | `201` the quest + `deactivated`; `400 INVALID_QUEST` when the number of right options does not fit the type |
| `PUT` / `DELETE /admin/checkpoints/:id/questions/:questionId` | same body / none | the quest + `deactivated` (and `result: archived \| erased` for delete); `409 QUESTION_IN_USE` while a student answers it |

## Quiz changes (BR50)

`GET /checkpoints` adds `description`, `typeMode`, `questionTypes` (`["MCQ"]`, `["MULTI"]` or both) and `timeLimitSeconds`. An attempt view has `timeLimitSeconds`, and every question has `type`, `selectedOptionIds` and, after a wrong answer, `correctOptionIds` (`correctOptionId` stays for the first one). `POST /attempts/:id/answers` takes `{ optionId }` or `{ optionIds: [..] }` (and `questionNumber`); a single-choice question needs exactly one option, a multi-select question at least one; the answer is correct only on an exact match.

## Login codes, settings and team order (2026-11-10: BR52, BR54, BR55)

| Endpoint | Body | Result |
|---|---|---|
| `GET /auth/config` | none (no session needed) | `{ otpPreview, mailConfigured }`: whether the login page shows the test inbox |
| `POST /auth/otp-preview` | `{ email }` | `200 { otp }`: the code that was e-mailed last to this address, only while the code preview is on and the code is still the valid one. `404 PREVIEW_OFF` (switch off) or `404 NO_CODE` (nothing requested, used, replaced or expired). Rate limited like the login |
| `GET /admin/settings` | none | `{ settings: { otpPreview, mailConfigured, environment } }` |
| `PUT /admin/settings` | `{ otpPreview: boolean }` | the settings again; logged as `setting_changed` |
| `POST /teams/me/leave` | none | `200 { team: null }`; `409 NO_TEAM`. A leaving leader hands over to the next member in the team order; the last member deletes the team |
| `PUT /admin/teams/:id/leader` | `{ studentId }` | `204`; `404 NOT_A_MEMBER`, `409 STUDENT_NOT_ACTIVE`, `404` unknown team |
| `PUT /admin/teams/:id/order` | `{ studentIds: [...] }` (every member exactly once) | `204`; `400 ORDER_MISMATCH` |

Changed shapes: `GET /teams/me` members carry `position` (team order, 1 = first). `GET /admin/teams` adds `leaderId` and members `{ id, displayName, position, status }` in team order. Admin user objects add `questsTotal` (live quests, so "3/7 quests" stays right when quests are added or archived). A team name has 3 to 30 characters (`400 INVALID_INPUT` below 3).
