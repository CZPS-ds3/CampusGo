# Location testing guide (testing at a PC, no walking around)

How to test the location check for all 8 checkpoints with Chrome DevTools. The machine-readable list of positions is
[checkpoint-coordinates.json](checkpoint-coordinates.json). Both files come from `backend/src/db/seed.js`;
`backend/tests/geofence.test.js` fails if the JSON and the seed disagree, so update both when a checkpoint changes.

All positions are public map points of the Bildungscampus Heilbronn, never real student locations. Do not add real
positions of students or team members here.

## 1. Start the app

| Mode | Command | Needs | Use it for |
|---|---|---|---|
| Mock (browser only) | `npm run dev:mock` | nothing | clicking through the screens, quick checks |
| Full stack | `npm run dev` | Docker Desktop | the real server rules, database, e-mail login |

Log in with an address ending in `heilbronn.dhbw.de`.
- Mock: code `123456`.
- Full stack: the code is printed in the terminal that runs `npm run dev` (or press *Open mock inbox*), unless `SMTP_*` is filled in `backend/.env`, then it arrives by e-mail.

## 2. Fake the location in Chrome (DevTools Sensors)

1. Open the app in **Chrome** and press **F12**. Keep DevTools open for the whole test (closing it can drop the setting).
2. Click **⋮** (top right of DevTools) → **More tools** → **Sensors**.
3. Under **Location** choose **Other…**.
4. Enter **Latitude** and **Longitude** from the tables below.
5. Set **Accuracy to `10`**. This matters: if it is left empty or high, the server answers "weak signal" even at the right spot (limit: 50 m, `MAX_ACCURACY_M`).
6. Set the position **right before** you tap "I'm ready". The server rejects readings older than 30 s, and Chrome's fake location seems to keep the time at which you set it. If you get "Your location reading was too old", re-apply the location (retype one digit, or switch Location away and back to **Other…**) and tap **Try again**. No page refresh is needed. For a long session you can set `MAX_POSITION_AGE_MS=600000` in `backend/.env` and restart the backend; put it back to `30000` afterwards.
7. In the app: map → checkpoint → **Start quest** → read the page → **I'm ready** → accept the location notice once.

To test another position, change the numbers in Sensors and tap **Try again** on the result screen.

**Keep `MAX_ACCURACY_M=50`** in `backend/.env`. Do not raise it to make tests pass; fix the Sensors accuracy instead. After editing `.env`, stop `npm run dev` (Ctrl+C) and start it again.

## 3. Test positions

"Inside" is a point well within the circle that still belongs to this checkpoint. "Outside" is 40 m beyond the radius, where the answer must be *Not there yet*.

| Checkpoint | Radius | Questions (pass) | Centre: lat, lng → must unlock | Inside: lat, lng → must unlock | Outside: lat, lng → *Not there yet* |
|---|---|---|---|---|---|
| Mensa | 60 m | 5 (4) | 49.148464, 9.215808 | 49.148464, 9.216303 (36 m) | 49.149363, 9.215808 |
| Library | 60 m | 5 (4) | 49.149493, 9.216467 | 49.149817, 9.216467 (36 m) | 49.150392, 9.216467 |
| CAS Cafe | 40 m | 3 (2) | 49.148951, 9.216205 | 49.149167, 9.216205 (24 m) | 49.149670, 9.216205 |
| Campus Garden | 50 m | 3 (2) | 49.147082, 9.217206 | 49.147352, 9.217206 (30 m) | 49.147891, 9.217206 |
| Care.box and Shop.box | 40 m | 3 (2) | 49.149088, 9.217270 | 49.149304, 9.217270 (24 m) | 49.149807, 9.217270 |
| Building B | 60 m | 5 (4) | 49.147126, 9.218486 | 49.147450, 9.218486 (36 m) | 49.148025, 9.218486 |
| Building C | 60 m | 5 (4) | 49.147316, 9.217900 | 49.146992, 9.217900 (36 m) | 49.148215, 9.217900 |
| Sensoricum | 40 m | 3 (2) | 49.147620, 9.217807 | 49.147836, 9.217807 (24 m) | 49.148339, 9.217807 |

Expected for **Centre** and **Inside**: "Locked on!", then the quiz opens and the timer starts at `questions × 60 s`
(5 questions = 5:00, 3 questions = 3:00).
Expected for **Outside**: "Not there yet. You are not at *name* yet. No attempt used." No timer, no attempt.

## 4. Overlapping circles: one spot never unlocks two checkpoints

Some circles overlap. A position inside several circles unlocks **only the checkpoint with the nearest centre**.
Stand at the centre of the first checkpoint, then try to start the second one:

| Stand at (lat, lng) | Tap this checkpoint | Expected |
|---|---|---|
| Building C: 49.147316, 9.217900 | Sensoricum (34 m apart) | "You are at Building C, not at Sensoricum." No attempt, no timer |
| Sensoricum: 49.147620, 9.217807 | Building C (34 m apart) | "You are at Sensoricum, not at Building C." No attempt, no timer |
| Building C: 49.147316, 9.217900 | Building B (48 m apart) | "You are at Building C, not at Building B." |
| Building B: 49.147126, 9.218486 | Building C (48 m apart) | "You are at Building B, not at Building C." |
| Campus Garden: 49.147082, 9.217206 | Building C (57 m apart) | "You are at Campus Garden, not at Building C." |

Then tap the checkpoint you are really standing at: it must unlock.

## 5. Failure cases (none may use an attempt or start a timer)

| What to do | Expected |
|---|---|
| Accuracy `80` in Sensors, position at a centre | "GPS signal weak — try again. No attempt used." (server answer `ACCURACY_TOO_LOW`) |
| Accuracy `50` (exactly the limit) | Unlocks |
| Set the position, wait over 30 s, then tap "I'm ready" | "Your location reading was too old" (`STALE_POSITION`) |
| Sensors → Location → **Location unavailable** | "Your browser could not find a position" |
| Lock icon in the address bar → Location → **Block** | "Location is off" with a *Check again* button |
| Tap "I'm ready" twice quickly, or refresh during the quiz | The same attempt and the same timer, no second attempt |
| After the quiz started, change the Sensors position to somewhere far away and answer | Answers are still accepted until the timer ends (leaving the circle changes nothing) |
| Finish a checkpoint with a pass, then start it again | "Checkpoint cleared", no new attempt |

## 6. If it says "Weak signal" although the position is right

Open DevTools → **Network**, tap "I'm ready" again, click the `verify` request and read the response:

| You see | Meaning | Fix |
|---|---|---|
| `ACCURACY_TOO_LOW` | Accuracy above 50 m, or the server still has an old limit | Set Sensors accuracy to 10; restart the backend after editing `.env` |
| `STALE_POSITION` | Reading older than 30 s (Chrome keeps the time you set the fake location) | Re-apply the location in Sensors, then tap right away; or raise `MAX_POSITION_AGE_MS` for desktop tests only |
| `"status": "OUTSIDE"` | Wrong coordinates, or a nearer checkpoint takes the spot | Check the numbers; see section 4 |
| `CONSENT_REQUIRED` | Location notice not accepted | Accept it, tap again |
| `TOO_MANY` | More than 10 taps in a minute | Wait one minute |
| no `verify` request | Chrome returned no position | Keep DevTools open, set Location to **Other…** |

## 7. Automated checks

```bash
npm run lint
(cd frontend && npx vitest run)                                    # frontend, mock API
(cd backend && npx vitest run tests/geofence.test.js)              # geofence maths, no database
npm run test:e2e                                                   # browser tests (mock mode)
npm test                                                           # all tests, needs Docker for MySQL
```

## 8. Before the pilot: test on real phones (WP13)

Chrome's fake location only proves the software. At every checkpoint, with at least two phones (for example iPhone Safari and Android Chrome), stand at the entrance and at the edge of the circle and record the result. Adjust radii with a plain `UPDATE checkpoints SET radius = … WHERE checkpoint_name = '…';`. Location on a phone needs **HTTPS** (the staging site or a temporary tunnel; do not leave a tunnel running). Update the tables above and `checkpoint-coordinates.json` if a centre or radius changes.
