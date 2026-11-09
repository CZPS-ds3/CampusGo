# Test architecture and runner: design spec

> Chosen by a two-agent /arena run on 2026-10-29 (round 1, a001 beat a002, 89 to 80.5). The full record is in `.arena/` (git-ignored). The build follows this spec with the deviations listed in `tests/README.md` (section "Deviations from the spec").


## Constraints and assumptions
- Existing suites stay in place (`backend/tests`, `frontend/tests`, `frontend/e2e`, `frontend/e2e-fullstack`); the manifest only references them. New files are additive.
- Runner is Node `.mjs` with no new dependency (Windows-safe, like `scripts/ensure-db.mjs`). Python 3.11 tests run as subprocesses; `pymysql` is added to `tests/requirements.txt` (pure Python; needed for direct SQL checks). Only new JS dev dependency: `@axe-core/playwright`.
- "Restart ALL tests on any error": after a failure, clean, then rerun everything from category 1. Bounded: default 2 restarts (3 attempts).

## 1. Tree
```
tests/
  README.md            run guide, categories, prerequisites, retry policy
  manifest.json        categories -> commands, prerequisites
  run-all.mjs          runner: order, prerequisites, restart loop, verdict
  lib/env.mjs          builds the child env; refuses any DB name other than campusquest_test
  lib/services.mjs     starts/stops API (3100) and Vite (5175); log to reports/api.log; taskkill /T /F
  lib/reset-db.mjs     drops all tables in campusquest_test, migrates, seeds, checks canary rows
  lib/report.mjs       reports/summary.json + console table
  requirements.txt     pinned pytest, requests, pymysql, pylint, black
  pyproject.toml, .pylintrc   black/pytest/pylint config (line length 100)
  python/conftest.py   fixtures: base_url, unique_email(), unique_ip(), login() with a planted code (plant_code), db()
  python/{api,db,perf,security}/   pytest suites
  node/                `node --test` config-level checks (no port, no DB), e.g. production mode
  regression/          one test per fixed bug: bug-<id>-<slug>, names the BR
  ux/a11y.spec.js, ux/playwright.config.js     axe + keyboard + viewport (mock API, like frontend/e2e)
  e2e/fullstack.config.js   runs frontend/e2e-fullstack against the runner-owned stack
  perf/budgets.json    numeric budgets
  reports/             gitignored output
```

## 2. Manifest and runner
Each category: `id`, `cmd`, `cwd`, `needs` (`db`, `api`, `vite`, `browsers`, `build`), `timeoutSec`, `kind`.
Order, cheapest and least stateful first: (1) `lint`, `format`, `black`, `pylint`; (2) `unit-frontend`, `unit-backend` (db); (3) `build`; (4) `node-config`, `python-db`, `python-api`, `python-security`, `regression` (db+api); (5) `e2e-mock`, `ux` (browsers); (6) `e2e-fullstack` (db, api, vite, browsers); (7) `perf` (build, db, api), last so load disturbs nothing.

**Database safety (never touches `campusquest`).**
- `env.mjs` never loads `backend/.env`. It reads `TEST_DATABASE_URL` (default `mysql://cq:cq_dev_password@127.0.0.1:3307/campusquest_test`), requires database name exactly `campusquest_test` and host in {127.0.0.1, localhost, `mysql` when `CI=true`}, else aborts. `reset-db.mjs` and the pytest `db()` fixture repeat the check before any DROP/DELETE.
- Reset per attempt: drop every table (including `schema_migrations`, so migrations really re-run) in `campusquest_test`, then `migrate()`, then `seed.js`, each with the explicit child env `DATABASE_URL=<test url>`, `NODE_ENV=development` (config and seed read DATABASE_URL then; a value already in the environment is never overridden by a .env file). Canary check: admin id 1 exists, 8 checkpoints, BR11 rows present; otherwise abort.
- Never runs `db:reset`, `ensure-db.mjs --reset`, or the plain dev seed. Docker is started with `docker compose up -d --wait` only; `SKIP_DOCKER=1` and CI skip it.

**API safety.** The API is started as `node backend/index.js` (no `--env-file`) with a full explicit env: `PORT=3100`, `NODE_ENV=development`, test DB URL, `TRUST_PROXY=1`, `FRONTEND_ORIGIN=http://localhost:5175`, all `SMTP_*` blank (tests never send real mail; codes are planted in the test DB with a fixed test `OTP_SECRET`), `OTP_RESEND_COOLDOWN_SECONDS=0`, `OTP_RESEND_MAX_PER_HOUR=1000`. Before any suite the runner polls `/api/health`. Occupied port: fail with a message, never kill a foreign process. The API stops in `finally`, on SIGINT and via a PID file.

**Full-stack browser run.** `frontend/playwright.fullstack.config.js` hard-codes 5173, `npm run dev` and `reuseExistingServer: true`, which could reach the dev stack. So `tests/e2e/fullstack.config.js` reuses `testDir ../frontend/e2e-fullstack` (its specs use relative URLs), `baseURL` 5175, no `webServer`, no reuse. The runner starts Vite itself: `vite --port 5175 --strictPort` with `BACKEND_URL=http://localhost:3100`.

**Rate limits.** Limiters are live (disabled only when NODE_ENV=test). Per-e-mail OTP caps are avoided with a unique e-mail per test. The 30 per 15 min IP limit is avoided because `unique_ip()` sends a fresh `X-Forwarded-For` for every login, including every perf request; `e2e-fullstack` uses about 4 logins from 127.0.0.1. One file tests the real limits (cooldown 30 s, 5 per hour, 30 per 15 min) against its own API instance with real values and its own IP.

**Restart-all and verdict (single rule).**
- Attempt n: kill services, reset DB, delete `frontend/test-results` and `tests/reports/attempt-*`, free ports 3100 and 5175, run categories in order. Each category runs to completion (all failing tests are collected from junit/JSON output); the run stops after the first failing category, then restarts from category 1. Playwright `retries: 0` and no Vitest retry: the runner is the only retry layer.
- Verdict: exit 0 iff some attempt is fully green; otherwise exit 1. A green attempt after earlier failures is labelled PASSED-AFTER-RETRY and lists category, test and message in `summary.json` and the table; CI uploads it as an artifact so flakiness is visible, not silent. The same test with the same message failing in two consecutive attempts is a REAL FAILURE: retries stop early, exit 1.
- Trade-off: a full run is perhaps 5 to 8 minutes, up to 3x on failure. The PM's rule is kept literally, bounded by the cap and by early stop on deterministic failures. It gives up strictness (a flaky test can pass after retry); `--strict` makes PASSED-AFTER-RETRY exit 1.
- Scripts: `test:all` (`node tests/run-all.mjs`), `test:all:ci` (`--ci --retries 1`), `test:py`, `test:cat -- <id>`.

## 3. Test ideas
- **unit**: BR19 attempt 2 gives 85 % after bonuses, fractions round up; team score = ceil(average) in integers; `x@heilbronn.dhbw.de.evil.com` rejected.
- **integration** (`python/api`): 6th invite to a team of 5 returns 409; `A@..` and `a+tag@..` do not create a second account; an invitation accepted after 24 h is rejected (age set by direct DB timestamp).
- **backend / frontend**: existing suites; plus a `node/` test: with a `NODE_ENV=production` config, `createApp` on port 0 answers 404 for `/api/dev/last-otp` (no route hands out codes).
- **e2e / browser**: mock suite on 6 viewports; full-stack login, start quiz, refresh, same question set (BR25); geolocation denied shows "check again", no attempt consumed (BR12).
- **ui/ux**: axe zero serious/critical on login, quiz, leaderboard; Tab reaches every control with visible focus; no horizontal scroll at 320 px.
- **database**: duplicate `users.email` insert fails; points and multipliers come from tables (BR11): change the row, the score changes; deleting the admin is refused.
- **regression**: OTP rejected after a resend; backend refusing connections when `index.js` did not respond (health answers within 5 s of start).
- **performance**: `/api/leaderboard` p95 under 300 ms over 50 requests with 200 seeded users; login p95 under 200 ms, one rotating IP per request; gzipped JS in `frontend/dist` at most 190,000 B (measured today 145,556 B; read from the artifact of the `build` category, which is ordered earlier).
- **security/privacy**: admin (id 1) never in solo or team rankings; no response holds another user's e-mail or last name; expired session gives 401; coordinate canary: verify a location at distinctive coordinates (49.123457, 9.654321), then dump every cell of every table (the `checkpoints` table legitimately holds coordinates and is excluded by name) and `reports/api.log`, and grep for the canary digits, the OTP and the session token.

## 4. pylint and black
- Categories `black` (`black --check --config tests/pyproject.toml tests/python tests/regression`) and `pylint` (`pylint --rcfile tests/.pylintrc tests/python tests/regression`). Scripts: `lint:py`, `format:py`; `npm run check` gets `&& npm run lint:py`. `.prettierignore` excludes `tests/python`.
- GitLab: job `python-lint` (stage check, image `python:3.11`, `pip install -r tests/requirements.txt`). Job `integration-tests` (stage test): image `node:24-bookworm` (Debian ships Python 3.11), `before_script` installs `python3-venv`, creates a venv, installs requirements; MySQL service alias `mysql`, `TEST_DATABASE_URL: mysql://cq:cq_dev_password@mysql:3306/campusquest_test`, `SKIP_DOCKER: '1'`; script `node tests/run-all.mjs --ci --only node-config,python-db,python-api,python-security,regression`. Existing jobs stay on `node:22`. `e2e-fullstack`, `ux` and `perf` are manual jobs like the existing browser job.

## 5. Risks
| Risk | Avoidance |
|---|---|
| Wrong DB wiped | Name and host check in three places; dev DB never named in a command; no `db:reset` |
| Dev stack hit by browser tests | Own ports 3100/5175, no reuse, own config |
| Real mail sent by a test | Blank SMTP, no .env for the API, fixed test OTP secret |
| Rate limits | Unique e-mail and IP per test, API restarted per attempt, limit tests isolated |
| Orphan processes (Windows) | `taskkill /T /F`, PID file, `finally` |
| Flaky browser tests | web-first assertions, no sleeps, runner-level retry only |
| Time-based rules | env overrides or DB timestamps, never real waiting |
| Perf noise | budgets about 1.3x measured, p95, last |
| Placeholder seed data | tests create fake `@heilbronn.dhbw.de` users, no real data |

## 6. Documentation
`README.md` (how to run), `CLAUDE.md` (test table, bug -> regression test rule), `.gitignore` (`tests/reports/`, `__pycache__/`, `.pytest_cache/`, `.venv/`), `requirements.md` (Python 3.11, pytest, pylint, black, requests, pymysql), `project_brief.md` (strategy, restart-all rule, verdict rule).
