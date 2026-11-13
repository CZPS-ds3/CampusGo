# Requirements — What to Install

Everyone on the team needs the tools below on their own machine. The project uses **npm only** (no yarn, no pnpm). Check each version with the command shown.

## 1. Required software

| Tool | Version | Check | Download |
|---|---|---|---|
| Git | any recent | `git --version` | https://git-scm.com/downloads |
| Node.js (includes npm) | **LTS ≥ 20** (24 works) | `node -v` and `npm -v` | https://nodejs.org |
| Docker Desktop | any recent | `docker --version` | https://www.docker.com/products/docker-desktop |
| Code editor | VS Code recommended | – | https://code.visualstudio.com |
| SSH key registered on the DHBW WI GitLab | – | `ssh -T git@wi-git.heilbronn.dhbw.de` | GitLab → Preferences → SSH Keys |

## 2. Install the project (one command)

```bash
git clone git@wi-git.heilbronn.dhbw.de:yih.lim.26/campus-city-quest.git
cd campus-city-quest
git checkout wip/<your_name>/feature
npm install
npm run dev
```

`npm install` installs the frontend and the backend (npm workspaces, one `package-lock.json`) and then runs `scripts/setup.mjs`, which creates `backend/.env` and `frontend/.env` from the `.env.example` files with fresh random secrets and checks your Node and Docker versions. `npm run dev` starts the MySQL container (Docker Desktop must be running), creates the tables, loads the seed data and starts the API (port 3000) and the web app (port 5173). Use `npm ci` for a clean, reproducible install; use `npm install <package>` only when you deliberately add a dependency (commit `package.json` and `package-lock.json`, and say why in the MR).

## 3. What gets installed

| Area | Packages | Purpose |
|---|---|---|
| Tooling (root) | `eslint`, `@eslint/js`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`, `eslint-config-prettier`, `prettier`, `concurrently` | Linting, formatting, starting API and web app together |
| Backend | `express`, `mysql2`, `zod`, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `nodemailer`, `multer`, `sharp` | API, database, validation, security headers, rate limits, OTP e-mail, picture upload and re-encoding |
| Backend tests | `vitest`, `supertest` | Rule tests against a real test database |
| Frontend | `react`, `react-dom`, `react-router-dom`, `leaflet`, `@fontsource/*` (Anton, Rubik, JetBrains Mono) | Screens, routing, map, self-hosted fonts |
| Frontend build and tests | `vite`, `@vitejs/plugin-react`, `vitest`, `jsdom`, `@testing-library/*`, `@playwright/test` | Build, unit tests, browser tests on phone, tablet and laptop sizes |
| Docker images | `mysql:8.4`, `node:22-bookworm-slim` (built from `backend/Dockerfile.dev` and `frontend/Dockerfile.dev`) | The development and test database; the API and the web app when everything runs in Docker (`npm run docker:up`) |

## 4. Daily commands (all via npm)

| Task | Command |
|---|---|
| Start database, API and web app | `npm run dev` |
| Start database, API and web app in Docker (Linux containers, Windows or Ubuntu) | `npm run docker:up` / `npm run docker:down` |
| Web app only, with fake data and no Docker | `npm run dev:mock` |
| Lint / auto-fix | `npm run lint` / `npm run lint:fix` |
| Check formatting / format all files | `npm run format:check` / `npm run format` |
| Run all tests (backend and frontend) | `npm test` |
| Browser tests on 6 screen sizes (downloads Chromium on first run) | `npm run test:e2e` |
| Smoke test through the real stack | `npm run test:e2e:full` |
| Build the web app | `npm run build` |
| Database | `npm run db:up`, `db:down`, `db:reset`, `db:migrate`, `db:seed` |
| **Everything before you push** | `npm run check` |

`npm run check` runs ESLint, Prettier, all tests and the build with zero warnings allowed. It must pass before every push and before opening a Merge Request. Without Docker use your own MySQL 8 and `SKIP_DOCKER=1` (see the README).

## 5. Environment variables

`npm install` copies `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env` for you (random `SESSION_SECRET` and `OTP_SECRET`). Fill in only what you need locally, for example the `SMTP_*` values to send real mails. **Never commit `.env`.** The `.env.example` files document every variable by name.

## 5a. Accounts and services you need

| Need | Why | Who decides |
|---|---|---|
| An SMTP server or a mail provider (free tier is enough for the pilot) | Sends the login OTP e-mails (BR01) | Ryan / Yuri, WBS 3.1 |
| Docker Desktop (development) and a MySQL 8 server (production) | Students, attempts, questions, scoring tables (BR11) | Ryan, WBS 5.2 |
| A web host with HTTPS | Browser geolocation requires HTTPS on real phones | Team, WBS 5.2 |
| Android and iOS phones | On-site location tests | Everyone |

## 6. Recommended VS Code extensions

- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)
- GitLens (optional)

## 7. Testing live location (everyone who works on location features)

- Browser geolocation only works on **HTTPS** or on `http://localhost` — use `localhost` in development.
- Test on **real phones** (Android Chrome and iOS Safari). Laptop location and emulators are not accurate enough.
- Keep the page open and the screen on while testing; browsers can pause location in the background.
- Never commit real location data of students or teammates; use fake coordinates in tests.

## 8. Python (tests only): pytest, pylint, black

The web app and the API are JavaScript. Python is used only for the black-box test suites in `tests/` (API, database, security, performance, regression). You need **Python 3.11 or newer** only if you run those:

```bash
python -m pip install -r tests/requirements.txt   # pytest, requests, pymysql, black, pylint
npm run lint:py                                   # black --check and pylint (must be 10/10)
npm run test:all                                  # everything, restarts all tests on a failure
```

`pymysql` is pure Python (no compiler needed). The Playwright browsers are installed by the runner on first use (`npx playwright install chromium`; `--all-browsers` adds Firefox and WebKit). Nothing in the Python folder runs in production.

## CI (GitLab)

`.gitlab-ci.yml` uses the `node:22` image and a `mysql:8.4` service for the backend tests (`TEST_DATABASE_URL` points at it, `SKIP_DOCKER=1`). The runner needs Docker (the shared GitLab runners have it). Every pipeline runs lint, the node config tests, `docker compose config` (job `docker-config`, image `docker:27-cli`, no daemon needed), Python lint and unit tests, backend and frontend tests, the integration tests (`tests/run-all.mjs --ci`: database, API, security and regression suites) and the build. The manual browser job uses `mcr.microsoft.com/playwright:v1.64.1-noble`; keep that tag equal to the Playwright version in `package-lock.json`.
