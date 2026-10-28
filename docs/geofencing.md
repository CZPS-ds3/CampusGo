# Geofencing Architecture

Implementation notes for the "Geofencing Architecture" section of the Main Project Document (check-on-tap geofencing). Business rules BR07, BR08, BR12, BR13, BR22, BR23, BR25. Work packages: WP5 (design), WP7 (build), WP9 (coordinates), WP11/WP12 (security), WP13 (on-site tests).

## Principle
- **Check on tap.** The student taps "I'm ready"; the phone takes **one** fresh, high-accuracy reading and sends it to the server. No live tracking, no background location.
- **The server decides.** The phone only reports a position. Freshness, accuracy and distance (Haversine) are checked on the server; the client's opinion about "inside" is never trusted.
- **Verification is the unlock.** When the reading is inside the circle, the server creates the attempt, draws the questions and starts the timer (`expires_at = now + question_count × 60 s`, BR13) in one transaction.
- **Leaving the circle afterwards changes nothing** (BR12). Location plays no part once the attempt exists.
- **Privacy.** Coordinates are used for one request and never stored or logged. The server keeps only "inside radius yes/no + time" (`location_checks`, deleted after 7 days).

## Flow

1. Map → checkpoint sheet → **read-first page** (facts, no timer, no location yet) → "I'm ready".
2. Location notice (consent, once) → `navigator.geolocation.getCurrentPosition` (high accuracy, 10 s timeout, `maximumAge: 0`).
3. Permission denied / no position / timeout: message + "Try again". No request, no attempt, no timer.
4. `POST /api/checkpoints/:id/verify` with `{ lat, lng, accuracy, ageMs }` (`ageMs` = phone clock − phone clock, so a wrong phone clock does not block anyone).
5. The server answers in the order of Figure 3:

| Step | Check | Answer if it fails | Attempt used? | Timer? |
|---|---|---|---|---|
| 1 | Session valid (BR01, BR03) | `401 UNAUTHENTICATED` | no | no |
| 2 | Input is a valid position | `400 INVALID_INPUT` | no | no |
| 3 | Checkpoint exists and is active (BR08) | `404 NOT_AVAILABLE` | no | no |
| 4 | Not already passed (BR23) | `409 ALREADY_COMPLETED` | no | no |
| 5 | Attempt already running here? (refresh, double tap) | `200 { status: 'OK', resumed: true, attempt }`, same questions and timer (BR25) | – | keeps running |
| 5b | Attempt running at **another** checkpoint | `409 ACTIVE_ATTEMPT_EXISTS` (`attemptId` in the body) | no | no |
| 6 | Location notice accepted | `403 CONSENT_REQUIRED` | no | no |
| 7 | Reading fresh: `0 ≤ ageMs ≤ 30 000` | `422 STALE_POSITION` | no | no |
| 8 | Accuracy ≤ 50 m | `422 ACCURACY_TOO_LOW` | no | no |
| 9 | Haversine distance ≤ radius | `200 { status: 'OUTSIDE', distanceM, elsewhere: null, message }` (distance rounded to 10 m) | no | no |
| 9b | **Nearest centre wins.** No other active checkpoint whose circle also contains the reading has a closer centre | `200 { status: 'OUTSIDE', distanceM, elsewhere: '<name>', message }` ("You are at Building C, not at Sensoricum") | no | no |
| 10 | All good: **unlock** | `200 { status: 'OK', resumed: false, attempt }` | yes | starts |

Rate limit: 10 verify calls per minute **per student** → `429 TOO_MANY`. Two simultaneous taps are caught by the database's unique keys; the loser gets the winner's attempt back.

## Settings (`backend/.env`)

| Name | Default | Meaning |
|---|---|---|
| `MAX_ACCURACY_M` | 50 | Reject readings less precise than this. Raise to 500 only for desktop tests with a faked location. |
| `MAX_POSITION_AGE_MS` | 30000 | Reject readings older than 30 s. |
| `SECONDS_PER_QUESTION` | 60 | Timer length per question (BR13). |
| `VERIFY_LIMIT_PER_MIN` | 10 | Verify calls per student per minute. |
| `LOCATION_RETENTION_DAYS` | 7 | How long "inside yes/no" rows are kept. |

Centre, radius, `is_active` and `question_count` live in the `checkpoints` table (BR08, BR11) and are changed with plain SQL, for example `UPDATE checkpoints SET radius = 70 WHERE checkpoint_name = 'Library';`.

## Checkpoints (Bildungscampus Heilbronn)

Centres are taken from OpenStreetMap features with these names (checked 2026-10-27); radii and question counts are the starting values of the Main Project Document, section 5. All of them still need the **on-site test (WP13)** with at least two phones at the edge of every circle.

| Checkpoint | Latitude | Longitude | Radius | Questions | Source (OpenStreetMap) |
|---|---|---|---|---|---|
| Mensa | 49.148464 | 9.215808 | 60 m | 5 | "Mensa Bildungscampus", Bildungscampus 8 (way 517420284) |
| Library | 49.149493 | 9.216467 | 60 m | 5 | "Bib Bildungscampus", R-Bau, Bildungscampus 15 (node 6766820453) |
| CAS Cafe | 49.148951 | 9.216205 | 40 m | 3 | "M-Bau (DHBW CAS)", Bildungscampus 13 (way 443802899) |
| Campus Garden | 49.147082 | 9.217206 | 50 m | 3 | "Campus Garden", next to A-Bau (Forum) (node 10973428037) |
| Care.box and Shop.box | 49.149088 | 9.217270 | 40 m | 3 | midpoint of "care.box" and "shop.box" (ways 1420183535, 1420183536) |
| Building B | 49.147126 | 9.218486 | 60 m | 5 | "B-Bau (DHBW)", Bildungscampus 4 (way 130362357) |
| Building C | 49.147316 | 9.217900 | 60 m | 5 | "C-Bau (DHBW)", Bildungscampus 5 (way 130362412) |
| Sensoricum | 49.147620 | 9.217807 | 40 m | 3 | taken on site: the grey DHBW Sensoricum building beside the Bildungscampus car park (not labelled in OpenStreetMap). |

**Overlapping circles.** Building C and the Sensoricum are only 34 m apart, so their circles (60 m and 40 m) overlap, as do several others (for example Mensa and CAS Cafe). One spot must never unlock two checkpoints, so a reading inside several circles belongs to the checkpoint with the **nearest centre** only (a tie goes to the lower id). Only active checkpoints take part. For Building C and the Sensoricum the dividing line is 17 m from each centre. This rule is an addition to the Main Project Document, which only compares the distance with the radius; it needs the team's approval. Tested for the whole campus by `backend/tests/geofence.test.js` (a grid sweep finds no spot that verifies two checkpoints).

Open points for WP9/WP13:
- **Sensoricum**: the dividing line to Building C is 17 m from each centre. Someone on the Sensoricum side of Building C (for example in its east wing) is treated as being at the Sensoricum. If that is too coarse, move the centres or shrink the radii after WP13.
- **Mensa**: OpenStreetMap has a second "Mensa Bildungscampus" point inside the A-Bau (Forum), 180 m from the Bildungscampus-Mitte Mensa used here. Confirm which one is meant.
- **CAS Cafe**: the centre is the CAS building; the "Cafeteria Bildungscampus" is 34 m away and inside the 40 m circle. Confirm on site.
- **Campus Garden**: the Main Project Document calls it an open space; OpenStreetMap names a café/restaurant "Campus Garden" at this point. Confirm.
- Other neighbouring circles overlap too (e.g. Building B and C are 48 m apart with 60 m radii). The nearest-centre rule above keeps them exclusive; shrink radii after WP13 if the dividing lines feel wrong.

## Known limits
A browser cannot stop a determined student with a fake-GPS app or developer tools. The controls (server-side decision, freshness and accuracy gates, per-student rate limit, timer, random questions, single pass) are a deterrent for a one-day pilot, not a guarantee (Main Project Document, section 8).

## Tests
- **Step-by-step guide with test coordinates for every checkpoint (Chrome DevTools, accuracy 10):** [testing/location-testing-guide.md](../testing/location-testing-guide.md), data in [testing/checkpoint-coordinates.json](../testing/checkpoint-coordinates.json).
- `backend/tests/geofence.test.js` (no database): Haversine (0 m, 55.6 m, 222.4 m), Figure 3 order, edge of the circle, seeded checkpoints within 500 m of DHBW Heilbronn.
- `backend/tests/quiz.test.js` (MySQL): section 9 tests 2–5 and 7–10 against the real endpoint.
- `frontend/e2e/flow.spec.js`: full journey, poor accuracy, far away (mock API).
- Tests and fixtures use invented positions or public map points only, never real student locations.

## Lenient settings (2026-10-28, proposal)

A student standing in Building B could not start the quiz, so the check was loosened (all values are in `backend/.env`, not in code):

- `MAX_ACCURACY_M` 50 to **100**: a reading with a worse accuracy is still refused.
- `GEOFENCE_SLACK_M` **25**: added to every radius, so a 60 m circle accepts up to 85 m from the centre.
- `NEARER_MARGIN_M` **20**: another checkpoint only wins ("You are at X, not Y") when its centre is at least 20 m nearer, so GPS jitter between two close checkpoints no longer sends a student away.

The stored radii and centres are unchanged (the on-site test WP13 can still tune them with plain UPDATEs). Tests: `backend/tests/geofence-lenient.test.js`.
