# Tests

One place that runs **every** kind of test of Campus & City Quest and tells you in one table what passed.

```
npm run test:all                      everything (about 8 to 12 minutes); restarts ALL tests when something fails
npm run test:cat -- python-api        one category (several: python-api,regression)
node tests/run-all.mjs --list         the categories
node tests/run-all.mjs --all-browsers also Firefox and WebKit in the browser smoke test (downloads them once)
npm run lint:py                       black and pylint on the Python tests
npm run check:all                     npm run check + lint:py + test:all
```

## Install once

```
npm install                                    # Node packages (includes @axe-core/playwright)
python -m pip install -r tests/requirements.txt   # pytest, requests, pymysql, black, pylint (Python 3.11+)
docker compose up -d --wait                    # MySQL (the runner does this too unless SKIP_DOCKER=1)
```

## The categories (run in this order)

| id | kind | what it checks | needs |
|---|---|---|---|
| `lint` | formatting | ESLint, zero warnings | |
| `format` | formatting | Prettier | |
| `black` | formatting | black on the Python tests | Python |
| `pylint` | formatting | pylint, must score 10/10 | Python |
| `python-unit` | **unit** (pytest) | photo list and credits, banned-word document equals the source list, seed checkpoints, migrations numbered without gaps, Python reference of the scoring and team-average rules | |
| `node-config` | unit (node:test) | production config problems, lenient geofence defaults, admin address, start-up error text, dev OTP route absent in production | |
| `unit-backend` | **backend** (Vitest) | the 170+ backend tests: scoring examples, auth, quiz, teams, admin, players, stats, geofence | MySQL test DB |
| `unit-frontend` | **frontend** (Vitest) | components, hooks, i18n coverage, mock API rules | |
| `build` | build | production build of the web app | |
| `python-db` | **database** (pytest) | tables, migrations in order, unique e-mail, admin id 1, 8 geofences, BR11 tables, 4 options and 1 right answer per question, no coordinates in `location_checks`, hashes only | fresh test DB |
| `python-api` | **integration** (pytest) | real HTTP: login, one session, teams, invitations, the 5 cap, privacy, every checkpoint inside and outside, a whole quiz | fresh DB, API |
| `python-security` | **security** (pytest) | headers, HttpOnly cookie, forged cookie, hostile e-mail strings, cross-site requests, OTP lock, login rate limit, owner-only attempts, **coordinate canary** (no coordinates, code or token in any table or in the API log) | fresh DB, API |
| `regression` | **regression** (pytest) | one test per bug that was fixed (Cass, invitation cap, admin ranked, team average, Building B, delete account, ties, ...) | fresh DB, API |
| `e2e-mock` | **end-to-end** (Playwright) | whole player and admin journeys on 6 screen sizes with the mock API (`frontend/e2e`) | browsers |
| `ux` | **UI/UX** (Playwright + axe) | WCAG 2.1 A/AA scan in light and dark on every screen, keyboard and focus rings, touch targets of 40 px, no sideways scroll at 320 px, German switch, reduced motion | browsers |
| `browser` | **browser** (Playwright) | smoke test: start, sign in, map, menu, a whole quiz, offline notice; Chromium (+ Firefox and WebKit with `--all-browsers`) | browsers |
| `e2e-fullstack` | end-to-end | the same journeys through the real stack: Vite on 5175, API on 3100, test DB (`frontend/e2e-fullstack`) | fresh DB, API, web |
| `perf` | **performance** (pytest) | latency budgets (p95), 200 players on the board, 50 parallel sessions, first question under 1.5 s, gzip size of the built JS and CSS (`tests/perf/budgets.json`) | fresh DB, API, build |

Existing suites stay where they are (`backend/tests`, `frontend/tests`, `frontend/e2e`, `frontend/e2e-fullstack`) because the team's CI uses them; `manifest.json` runs them under their category names.

## Rules of the runner

- **Restart ALL on any failure.** After a failure the runner stops the services, resets the database and starts again from the first category. Default: 2 restarts (3 attempts); `--retries N` changes it; `--ci` means 1.
- **Verdict.** Exit 0 only if one attempt is fully green. A green attempt after a failed one is printed as `PASSED-AFTER-RETRY` with the earlier failures listed (a flaky test must not hide); `--strict` makes that exit 1. The same category failing twice with the same message is a **real failure** and stops early.
- **Safety.** The tests only ever use the database `campusquest_test` on `127.0.0.1` (or the `mysql` service in CI); any other name is refused in three places (`lib/env.mjs`, `lib/reset-db.mjs`, the pytest `db` fixture). The development database `campusquest` is never touched; `db:reset` is never called. The runner starts its own API on port **3100** and its own Vite on **5175** (the UI tests use 5176, the browser test 5177) and only stops processes it started; if a port is busy it fails with a message.
- **API environment.** `NODE_ENV=development`, no `.env` file, blank SMTP (so `/api/dev/last-otp` exists), `TRUST_PROXY=1` and a fresh `X-Forwarded-For` per player so the login rate limit of 30 per 15 minutes never bites, `OTP_RESEND_COOLDOWN_SECONDS=0`.
- **Reports.** `tests/reports/` (git-ignored): `summary.json`, `api.log`, `web.log`, Playwright output.

## Running one Python file by hand

The Python stack tests need the runner's API and DB, so use the runner: `npm run test:cat -- regression`. `pytest tests/python/unit` works alone.

## Writing a new test

- Found a bug? Add one test to `tests/regression/test_regression.py` named `test_bug_<what>_<br>`, and make it fail first.
- Name the business rule (BR..) in the test name, like the Vitest tests do.
- Python tests: black (line length 100) and pylint 10/10 are enforced; use the `player` and `admin` fixtures, never reuse an e-mail address.

## Deviations from the design spec (`design/yi_heng/test-architecture-spec.md`)

- Python suites are grouped as `tests/python/{unit,api,db,security,perf}` and `tests/regression/` (the spec had `python/{api,db,perf,security}` and `regression/`).
- The real rate limits are tested in one security test (35 code requests from one address give a 429) instead of a second API instance.
- `npm run check` stays JavaScript only (not every teammate has Python); `npm run check:all` adds the Python lint and the whole runner.
- `ux/ux.spec.js` holds the accessibility and keyboard tests (the spec called it `a11y.spec.js`).
