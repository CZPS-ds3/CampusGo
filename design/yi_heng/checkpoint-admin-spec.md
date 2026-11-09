# Quest management and question types: design spec

> Chosen by a two-agent /arena run on 2026-10-29 (round 1, a001 beat a002, 72 to 68.5). The full record is in `.arena/` (git-ignored). Deviations of the build are listed in section "Deviations" at the end.


"Quest" is the admin word for a row in `checkpoints`. No new top-level table is needed. Everything below is checked against the current files (`001_init.sql`, `005_admin_and_media.sql`, `quiz.js`, `pictures.js`, `app.js`, `seed.js`).

## Assumptions
- Every question keeps exactly 4 options. MCQ has 1 correct option, multi-select has 2 or 3 (never 0 or 4). There is no partial credit.
- Hard/normal is independent of the type. Points and bonuses still come from the DB tables (BR11).
- Admins may edit any quest, but an edit never changes a running attempt or a past result.
- One quest has one type mode: `MCQ_ONLY`, `MULTI_ONLY` or `MIXED`. This is how the student is told the truth before starting, because the draw is random.

## 1. Schema (migration 008 "expand", code deploy, migration 009 "contract")

**008 (additive):**
1. `checkpoints` gets:
   - `description VARCHAR(1000) NULL`
   - `map_url VARCHAR(500) NULL`
   - `time_limit_seconds INT NULL` (NULL = `question_count * SECONDS_PER_QUESTION`, i.e. today's R-04 behaviour)
   - `type_mode ENUM('MCQ_ONLY','MULTI_ONLY','MIXED') NOT NULL DEFAULT 'MCQ_ONLY'`
   - `archived_at DATETIME(3) NULL`

   State is derived: draft = `is_active=0 AND archived_at IS NULL`, live = `is_active=1`, archived = `archived_at IS NOT NULL` (and `is_active=0`). `is_active` is kept, so nothing existing breaks.
2. Replace `ck_checkpoint` with: the existing lat/lng ranges, `radius BETWEEN 10 AND 500`, `question_count BETWEEN 1 AND 10`, `pass_threshold BETWEEN 1 AND question_count`, `time_limit_seconds IS NULL OR time_limit_seconds BETWEEN 10*question_count AND 600*question_count`, `hard_question_enabled=0 OR (question_count>=4 AND pass_threshold<=question_count-1)` (so a wrong hard answer can still pass, BR21, and the swap can fire), and `type_mode<>'MIXED' OR question_count>=3` (both types fit in slots 1..n-1). The default pass mark when the admin gives none is `ceil(2n/3)`, which reproduces 4/5 and 2/3; with hard enabled and n=4 or 5 the default is clamped to n-1 only if the admin asks for hard (the form shows the resulting mark). Also relax `ck_aq` to `question_number BETWEEN 1 AND 10`. Existing rows satisfy every new CHECK (all are n=3 or 5, MCQ_ONLY, hard only with n=5 and pass 4).
3. `questions` gets `question_type ENUM('MCQ','MULTI') NOT NULL DEFAULT 'MCQ'`. Drop `uq_one_correct` and its generated column `correct_question_id`, because multi-select needs several correct options. The "1 vs 2-3 correct" rule is enforced by the admin service inside a transaction (locking the question row) and re-checked by the `DRAWABLE_QUESTIONS` query: `HAVING COUNT(*)=4 AND ((question_type='MCQ' AND SUM(is_correct)=1) OR (question_type='MULTI' AND SUM(is_correct) BETWEEN 2 AND 3))`. A broken question is skipped, as today.
4. `attempts` gets `question_count` and `pass_threshold` snapshots (`NOT NULL`, backfilled from `checkpoints`). `finalizeAttempt`, `buildAttemptView` and `getResult` read them from the attempt, not from the live quest. This fixes the existing bug where editing a quest mid-attempt changes its judging.
5. New table `attempt_answers (attempt_id, question_number, question_id, option_id)`: PK all four columns; FK `(attempt_id, question_number)` to `attempt_questions`; FK `(option_id, question_id)` to `options (uq_option_question)`. Backfill: `INSERT ... SELECT` from `attempt_questions WHERE selected_option_id IS NOT NULL`.
6. `attempt_questions` gets `is_correct TINYINT(1) NULL`, set at submit time and never recomputed. Backfill via a join to `options.is_correct`.

**009 (after the deploy is verified):** drop `fk_aq_selected` and `selected_option_id`; new `ck_aq` is `(answered_at IS NULL) = (is_correct IS NULL)`.

**History:** no attempt, score or passed record is changed or deleted. Existing quests become `MCQ_ONLY`, with description and map_url NULL (the old lat/lng stay valid and are never re-derived). Existing attempts are all MCQ with one `attempt_answers` row each. The unique passed-attempt rule is untouched, so a passed quest stays final even if it is later edited or archived.

## 2. Quiz engine
- **Draw:** `n = checkpoint.question_count`, filtered by `type_mode`. For `MIXED` the draw first picks one MCQ and one MULTI and places them in slots 1..n-1 (the shuffle is over slots 1..n-1 only), then fills randomly. The hard swap only ever replaces slot `n`, so both announced types always remain. Expiry is `now + COALESCE(time_limit_seconds, n*secondsPerQuestion)`, stored in `attempts.expires_at` at unlock. Later edits cannot affect it.
- **Submit:** `POST /attempts/:id/answer {questionNumber, optionIds:[int]}`. The legacy `{optionId}` is mapped to `[optionId]`. In the existing locked transaction after the expiry check, the server:
  - requires `questionNumber` to be the first unanswered slot;
  - requires 1 to 4 distinct ids, all belonging to that question (else 400 `INVALID_OPTION`);
  - requires exactly 1 id for MCQ (400 `WRONG_SELECTION_COUNT`);
  - judges `correct = (selected set == set of is_correct options)` (exact match);
  - writes the `attempt_answers` rows plus `is_correct` and `answered_at`.

  A repeat submit returns 409 `ALREADY_ANSWERED`. An expired attempt is finalised first, as now.
- **View:** each question carries `type` and `options[]` without any correctness hints (not even the number of correct options). Answered slots add `selectedOptionIds`. After a wrong answer the response and view add `correctOptionIds`. Correct options are marked green with a "Correct" label, wrong picks red with "Your answer", and missed correct ones outlined with "Missed" (text plus icon, never colour only). MCQ keeps tap-to-answer. Multi-select shows checkboxes in a `role="group"`, the hint "Select all that apply" and a "Confirm answer" button.
- **Hard swap:** the offer fires when the answer to slot `n-1` is accepted. Conditions: attempt 1, `hard_question_enabled` (which implies `n >= 4` by the CHECK), slots 1..n-1 all `is_correct`, and a hard question honouring `type_mode` is drawable. This replaces the hard-coded `question_count === 5` and the "four" in `firstFourCorrect`.
- **Pass:** `correct_count >= attempt.pass_threshold`. The full-clear bonus is unchanged. The time bonus counts whole remaining seconds, capped at `n * secondsPerQuestion`, so a long custom limit cannot inflate points.
- **Quest changed while attempts run:** an ACTIVE attempt always completes on its snapshots (question set, `expires_at`, `question_count`, `pass_threshold`), even if the quest is edited, deactivated or archived afterwards. View, answer, swap and result read the quest by id regardless of state. Only new unlocks are refused (409 `QUEST_UNAVAILABLE`).

## 3. Admin API (under `/admin`, `requireAdmin`, zod, audit_events on every write)
Errors use the existing `AppError` shape `{error:{code,message}}`. Common codes: 400 `VALIDATION`, 404 `QUEST_NOT_FOUND` / `QUESTION_NOT_FOUND`, 409 `NAME_TAKEN`.

| Endpoint | Body / rules |
|---|---|
| `GET /quests`, `GET /quests/:id` | Include state, attempt count (and active attempts), question counts, `readiness[]`, `warnings[]`. |
| `POST /quests` (creates a draft), `PATCH /quests/:id` | `name` (3-60, unique), `description` (at most 1000), `mapUrl?`, `radius` (10-500), `questionCount` (1-10), `passThreshold?`, `timeLimitSeconds\|null`, `typeMode`, `hardQuestionEnabled`. Codes: `HARD_NEEDS_4_QUESTIONS`, `PASS_TOO_HIGH_FOR_HARD`, `MIXED_NEEDS_3_QUESTIONS`, `TIME_LIMIT_RANGE`. **Lat/lng are never accepted from the client.** The link check (section 4) runs on POST (mapUrl required) and on PATCH only when `mapUrl` is present and differs from the stored `map_url`. Otherwise the stored lat/lng are kept untouched, so renaming a legacy quest (map_url NULL) or a quest with a short link makes no network call. |
| `POST /maps/resolve {url, questId?}` | Preview of the check. 200 with `{lat,lng,source,warnings[]}` or 422 with a code. Rate limit 20/min per admin (429). |
| `PUT /quests/:id/facts {facts:[string<=300]}` | Maximum 5 entries (matches `ck_fact_position`). Replaces the whole list in one transaction. |
| `POST /quests/:id/images` (multipart `image`, `altText`, `credit`) | Maximum 6 images, 5 MB, new `storeCheckpointImage` (sharp, content-sniffed jpeg/png/webp, max 1600 px, re-encoded to WebP, EXIF stripped). Codes: 400 `INVALID_IMAGE`, 409 `IMAGE_LIMIT`. Alt text is required. |
| `PATCH /quests/:id/images/:pos`, `PUT /quests/:id/images/order`, `DELETE /quests/:id/images/:pos` | Alt/credit edits, reorder and delete (the file is removed after commit). |
| `GET/POST /quests/:id/questions`, `PATCH/DELETE /questions/:qid` | Body `{type, difficulty, text<=500, options:[{text<=255, correct}] x4, isActive}`. Codes: `OPTION_COUNT`, `DUPLICATE_OPTION` (trim, case-insensitive), `MCQ_NEEDS_ONE_CORRECT`, `MULTI_NEEDS_2_OR_3_CORRECT`. |
| `POST /questions/:qid/replace` | Same body as create. One transaction: retire the old question (`isActive=0`) and insert the new one. This is how a typo or wrong answer key in a played question is fixed on a live quest. Readiness is evaluated on the end state of the transaction (pool after both steps), so the pool never dips. |
| `POST /quests/:id/activate`, `/deactivate`, `/archive`, `/unarchive` | See below. |

**Delete vs archive:**
- `DELETE /quests/:id` is allowed only if there are no `attempts` (of any status, including ACTIVE) and no `location_checks` for it. Otherwise 409 `QUEST_HAS_HISTORY`, and the UI offers Archive. When allowed, one transaction deletes options, questions that belong only to this quest, facts, image rows and the quest; image files are unlinked after commit (a failure is logged, and a startup sweep removes files with no row).
- Archive and deactivate hide the quest from the student list and block new unlocks. Running attempts finish normally (section 2). Students who passed it still see it read-only and keep their points. Unarchive returns the quest to draft.
- A question referenced by `attempt_questions` is frozen: text, type, difficulty and options are locked (409 `QUESTION_IN_USE`). Only `isActive` can change, and fixes go through `/replace`.
- Unused questions are hard-deleted (options first, in a transaction).

**Readiness (invariant for live quests):** 422 `QUEST_NOT_READY` with `details:[{code,message}]` on activation. It requires:
- a location: a valid stored lat/lng inside the map area (legacy quests need no `map_url`), a name and a description;
- the CHECK rules above (pass threshold, hard needs n >= 4, MIXED needs n >= 3);
- at least `2n` valid active NORMAL questions of the allowed types;
- for `MIXED`, at least one valid question of each type;
- if hard is enabled, at least 3 valid active HARD questions (BR09) of the allowed types.

The same check runs on the end state of every write to a live quest (PATCH, retire, delete, radius change). A write that would break readiness is rejected with `QUEST_NOT_READY`. Changing `questionCount`, `typeMode` or the pass mark on a live quest affects only new attempts.

## 4. Google Maps link validator (`services/mapLink.js`)
Pure `parseMapLink(url)` plus `resolveShortLink(url, deps)`, with fetch and DNS injected so they can be tested.

**Order of checks (first failure wins):** EMPTY, TOO_LONG, NOT_A_URL, NOT_HTTPS, URL_NOT_ALLOWED, HOST_NOT_ALLOWED, short-link resolution (SHORT_LINK_*), PATH_NOT_MAPS, ROUTE_LINK, coordinate extraction (NO_COORDINATES), COORDINATES_INVALID, OUTSIDE_MAP_AREA, RADIUS_LEAVES_MAP_AREA, TOO_CLOSE_TO_QUEST.

**Accepted shapes** (after trim, at most 2048 characters, parsed with `new URL`, https only). Hosts: `google.com`, `www.google.com`, `google.de`, `www.google.de`, `maps.google.com`, plus short hosts `maps.app.goo.gl` and `goo.gl` (path `/maps/...`). On the `google.*` hosts the path must start with `/maps` (so `/search`, `/url` are refused as PATH_NOT_MAPS); `maps.google.com` accepts any path. A path starting `/maps/dir/` or `/dir/`, or a `saddr`/`daddr` parameter, is a route and is refused before any coordinates are read, even if the data string holds `!3d!4d` waypoints.
1. `!3d<lat>!4d<lng>` in the path or data. This is the pin and wins over the shapes below (never over ROUTE_LINK).
2. `/@<lat>,<lng>,<zoom>z`. This is only the viewport centre, so it is used if no pin exists.
3. `?q=`, `?ll=`, `?query=` or `/maps/search/<lat>,<lng>` with a decimal pair, after URL-decoding.
4. A bare `49.1234, 9.2100` is also accepted as a fallback, if Google changes its URLs.

**Short links (SSRF):**
- Allowed only for the two short hosts, port 443, no credentials.
- Use undici (bundled in Node 20, added explicitly as a dependency and justified in the MR) with a dedicated `Agent({ connect: { lookup } })`. The custom `lookup` resolves the name and rejects any private, loopback, link-local, CGNAT, metadata or IPv4-mapped IPv6 address (127/8, 10/8, 172.16/12, 192.168/16, 169.254/16, 100.64/10, 0/8, ::1, fc00::/7, fe80::/10) and returns only the validated address, so the socket connects to exactly the checked IP with TLS SNI still set to the hostname (no second resolution, so no DNS rebinding window). Plain `fetch(url)` after a separate `dns.lookup` is explicitly not allowed.
- Follow at most 3 redirects manually (`redirect:'manual'`), reading only the `Location` header, never the body. Every hop is re-validated through the full host/https/credentials/port rules. `consent.google.com` is also allowed, and its `continue=` target is read.
- Timeout 3 s per hop and 5 s in total, fixed User-Agent, no cookies. Remote content and headers are never returned to the client. The final URL is then parsed as a long link.

**Rejections** (422, `{code, message}`):

| Code | Wording |
|---|---|
| `EMPTY` | Paste a Google Maps link first. |
| `TOO_LONG` | This link is too long (limit 2048 characters). |
| `NOT_A_URL` | This is not a web address. Copy the full link from the browser address bar or Google Maps' Share button. |
| `NOT_HTTPS` | Only https links are accepted. |
| `URL_NOT_ALLOWED` | The link contains a user name, password or port, which is not allowed. |
| `HOST_NOT_ALLOWED` | This is not a Google Maps link (host "{host}"). Open the place in Google Maps and copy its link. |
| `SHORT_LINK_UNRESOLVED` | The short link could not be opened (timeout or no answer). Open it in your browser and paste the long link from the address bar. |
| `SHORT_LINK_BLOCKED` | The short link leads somewhere that is not Google Maps (or has too many redirects), so it was not followed. |
| `PATH_NOT_MAPS` | This Google link is not a Maps link (for example a search or redirect page). Open the place in Google Maps and copy that link. |
| `ROUTE_LINK` | This is a route link, not one place. Search for the place itself and copy that link. |
| `NO_COORDINATES` | The link has no exact position (it points to a search or a place name). Click the spot on the map and copy the link again. |
| `COORDINATES_INVALID` | The coordinates are not valid (latitude -90 to 90, longitude -180 to 180). |
| `OUTSIDE_MAP_AREA` | This place ({lat}, {lng}) is outside the area students can see (latitude 49.12 to 49.18, longitude 9.17 to 9.26). Choose a place inside the map. |
| `RADIUS_LEAVES_MAP_AREA` | With radius {r} m the check circle would leave the map area. Reduce the radius or move the place. |
| `TOO_CLOSE_TO_QUEST` | This place is only {d} m from "{name}" (minimum {min} m). Choose a different spot, or edit that quest instead. |

- **Map area:** the bounds `[[49.12, 9.17],[49.18, 9.26]]` become a shared constant used by `MapView.jsx`, the backend and the mock, so they cannot drift. The point must be inside, and on save the whole radius circle must be inside too (checked when position or radius changes).
- **Distance:** only near-duplicates are blocked. The haversine distance to every non-archived quest except itself must be at least `MIN_QUEST_DISTANCE_M = 10`. Overlapping check circles are legitimate (the seeded Building B and Building C are about 48 m apart with 60 m radii, and Sensoricum sits about 20 m from Building C), so overlap only produces a non-blocking `warnings[]` entry ("This check area overlaps "{name}"; a student may be inside both"). The distance check runs only when lat/lng change (never on a radius-only edit), and the seeded pairs are grandfathered.
- **Storage:** lat/lng are rounded to 6 decimals and the original URL is stored in `map_url`. Raw student coordinates stay out of scope and unlogged.

## 5. UI
**Admin** (new, next to the existing nav; `AdminTestQuests` stays as the test-mode page):
- `AdminQuests.jsx`: table of quests with state chip, attempts, question counts, a readiness badge, and Edit / Activate / Archive / Delete actions.
- `AdminQuestEdit.jsx` with tabs:
  - Basics: name, description, question count, pass mark, time limit (mm:ss) with a "default" checkbox, type-mode radio (MIXED disabled below 3 questions), hard-question toggle (disabled below 4 questions, with help text).
  - Location: a paste box and a "Check link" button, with the exact reason shown inline on failure. On success it shows lat/lng, a mini Leaflet map (the bounds rectangle, the radius circle and neighbouring quests), overlap warnings and a radius field. Existing legacy quests show their stored position and "no link saved".
  - Information: up to 5 facts, reorderable.
  - Photos: upload, required alt text, credit, reorder.
  - Questions: table filtered by type and difficulty, plus an "Add question" modal.
  - A side panel with the live readiness checklist; the Activate button is disabled until it is clear.
- **Question modal:** type radio, difficulty, text, and 4 option rows (a radio for MCQ, checkboxes for MULTI) with live validation. For a frozen question it offers "Replace question" (calls `/replace`).
- **Pop-ups:** delete confirm (shows the attempt count, and offers Archive when there is history); deactivate/archive confirm (states that running attempts will finish); unsaved-changes guard.

**Student:**
- The `Info.jsx` and quest-card screens show "This quest: 5 questions, 5 minutes, pass with 4. Question types: Single choice, Multiple choice (select all that apply)", derived from `typeMode`. It sits above the Start button (before the timer begins). `MIXED` is only shown when both types are guaranteed in the draw.
- `Quiz.jsx` gets the multi-select UI and the reveal described in section 2.
- The checkpoint list returns `typeMode`, `timeLimitSeconds`, `questionCount` and `passThreshold`, and hides archived quests unless passed.
- `mock.js` mirrors the new fields, `optionIds`, the link parser (long links plus one fixture short link) and the readiness rules.

## Risks and mitigations
1. **SSRF through short links:** host allowlist, per-hop re-check, undici connect-time lookup pinning the validated IP, header-only reads, timeouts, rate limit, and tests with private IPs, rebinding stubs and a redirect to an external host.
2. **Editing a question or quest rewrites history:** attempts snapshot `question_count` and `pass_threshold`, used questions are frozen (fix via `/replace`), and `is_correct` is stored at submit time.
3. **A live quest can no longer be drawn (pool too small):** the readiness invariant on the end state of every write, plus a runtime guard that returns a 409 "temporarily unavailable" and never starts a partial attempt.
4. **Multi-select answer leakage or cheating:** no hints about the number of correct options, judging only on the server with the exact-set rule, no correct ids before the answer, and the time bonus capped.
5. **Google URL formats change or consent redirects break parsing:** pin, viewport and `q=` parsing with the bare "lat, lng" fallback, a fixture test per shape, and the rejection codes logged so a spike is visible.
6. **Application-only enforcement of 1 vs 2-3 correct options** (the DB unique index is gone): enforcement inside a locked transaction, a re-check in the draw query, and an integrity test that scans all questions.

## Deviations from this design (what was built, 2026-10-29)

The arena winner is the base of the build. Where the code differs, it is on purpose:

1. **Names:** the types are called `MCQ` and `MULTI` (the project manager's words). The quest mode is `MCQ_ONLY`, `MULTI_ONLY` or `MIXED`; a mixed quest draws at least one question of each type.
2. **Exactly four options for every question** (the draw query and the pilot rules already assume four); MCQ has one right option, MULTI has two or three. The database no longer has the unique index, so the admin service and the draw query enforce it.
3. **Editing used questions:** options are changed in place (the option ids stay), the correctness of an answer is stored in `attempt_questions.is_correct` when it is given, and a question that a student is answering right now cannot be edited or deleted (`QUESTION_IN_USE`). A separate "replace" endpoint was not needed. A used question is archived, never erased.
4. **Short links:** resolved on the server with a host allow-list (Google only), https only, at most 5 redirects, header-only reads and a 5 second limit. Connect-time IP pinning (undici) was not added, to avoid a new dependency; the hosts are fixed Google names, so there is no user-chosen host to rebind. The in-browser mock cannot open short links and says so.
5. **Photos:** stored as 1280 x 720 WebP through the existing sharp pipeline (limit 2 MB per file, 5 per quest); removing a photo also removes the file.
6. **Time bonus:** capped at the default time of the quest (`question_count` x 60 s), so a long custom limit cannot raise the points.
7. **Seed:** the pilot seed stays 3 or 5 questions and MCQ only, so the new engine behaves exactly like the old one for existing data.
