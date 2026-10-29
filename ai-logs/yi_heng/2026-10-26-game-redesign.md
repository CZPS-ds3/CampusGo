# AI Log — Game redesign: build of the Campus & City Quest app

- **Date:** 2026-10-26
- **Team member:** yi_heng
- **AI tool / model:** Claude Code (VS Code extension), Claude Sonnet 5.5, with sub-agents for the `/arena` tournament and the `/impeccable` design skill
- **Objective:** Commit the documentation, then build the real application on `wip/yi_heng/feature` from the "GAME MODE" prompt: React frontend and Express/MySQL backend implementing BR01–BR25, responsive on phone, tablet and laptop, using the Figma Make export (campusGO Prototype Design) as reference, tests and docs included. No merge request and nothing merged into `preproduction` or `main`.

## Timeline (times from git commits and file times; "approx." where only the order is known)

| Time | What happened |
|---|---|
| 21:42 | Documentation work of the earlier session committed (`docs: add business rules, data model and specs`, `docs: add AI logs for yi_heng`) |
| approx. 21:44 | Plan agreed (questions answered: Docker Compose MySQL, install starts everything, dark/light visual mix, no Pokéball or Persona look, plain circle menu trigger, map with placeholder coordinates, one run) |
| 21:44–22:05 approx. | `/arena` tournament with 2 agents on the menu and quiz UI (spawn, attack, defend, judge). Winner a002 (86 to 73.5). Result stored in `design/arena/menu-and-quiz-ui-spec.md` and `design/decisions.md` |
| approx. 22:00–22:29 | Backend: Docker Compose MySQL, `scripts/setup.mjs` and `ensure-db.mjs`, migration, seed, services (auth, teams, quiz, leaderboards, scoring), routes, rate limits, tests |
| 22:29 | Commit `feat(backend): add Express API, MySQL schema, Docker setup and backend tests` |
| approx. 22:30–22:55 | Frontend (React, Vite, Leaflet, tokens, 14 screens, round menu, mock API), unit tests, Playwright on 6 screen sizes, full-stack smoke test, `/impeccable` checks on screenshots, fixes |
| approx. 22:55 | Docs, design folder, README quick start, traceability, lint and format, final commit |
| end | Figma export folder `campusGO Prototype Design` and its zip copy deleted after its sources were kept in `design/prototype/` |

## AI Prompts Used
1. "Please commit this into my wip/yi_heng/feature branch … short commit message … do not open a merge req into preprod yet … log everything into my ai logs with correct time stamps … I have uploaded the figma make folder … make changes based on this prompt … delete that folder at the very end … responsive on laptop, tablet, phone." plus the long "Build Campus & City Quest GAME MODE" prompt (visual direction "Arcade Night Campus", folder structure, frontend and backend work, BR01–BR25, tests, lint, docs, AI log).
2. Answers to the planning questions: Docker Compose for MySQL and automatic setup on install; reduce the Pokémon GO idea (no Pokéball, no Persona look); mix the dark arcade spec with the light red and grey look of the export; use `/arena` and `/impeccable`; keep a slanted, staggered menu with an own twist and a plain circle as trigger; CARTO dark tiles with placeholder coordinates.
3. "Continue" after the context ran out (the session was resumed from a summary).

## Changes made

**Backend (`backend/`)**: Express API with zod validation, helmet, CORS, rate limits, cookie sessions; MySQL schema with generated-column unique keys for "one active session / attempt", "one passed attempt", "one pending invitation"; seed for scoring tables, 8 placeholder checkpoints and placeholder questions; OTP login (HMAC hash, 10 min, 5 tries, 30 s resend), team and invitation rules, haversine location check that stores only yes/no and time, server-side timer and scoring with integer arithmetic, leaderboards with ties, expiry sweep, housekeeping, picture upload with re-encoding. 83 tests (Vitest + Supertest on a real test database) covering the 15 worked examples and acceptance checks 1–25.

**Frontend (`frontend/`)**: React + Vite, 11 pages (splash, login with OTP boxes, map, quests, quiz, result, team, ranks, profile, city teaser, 404), round menu with the slanted trail, server-driven quiz with timer, hard-question sheet, expiry layer, offline banner, in-browser mock API (`npm run dev:mock`), self-hosted fonts, 23 unit tests, 72 Playwright tests on 360, 390, 430, 768, 1024 and 1280 px widths, one smoke test through the real stack.

**Tooling and docs**: npm workspaces, `npm install` creates the `.env` files, `npm run dev` starts MySQL, migrates, seeds and runs everything; ESLint for React, Prettier, `.gitattributes`; new `design/` folder (problem statement, architecture, ER diagram, API documentation, use cases, schema notes, decisions, arena UI spec, prototype reference, screenshots); README quick start and troubleshooting; requirements, CLAUDE.md, handbook (C3 city expansion as Could, MySQL decided), business rules (30 s resend), traceability (tests by file); "Pokémon GO" wording replaced by "location-based game".

## Decisions Made
- **Accepted** the arena winner (a002): trail-stone menu with plain circle trigger, light panels for reading content, dark ground for game surfaces. Auto-advance after a correct answer from the spec was **left out** (a player always presses Next): moving content on a timer is harder to use with a keyboard or screen reader.
- **Changed** the map tiles: CARTO's free dark tiles answered with an "API KEY REQUIRED" watermark, so OpenStreetMap tiles are used and darkened with a CSS filter (`VITE_MAP_TILE_URL` and `VITE_MAP_DARKEN` switch it).
- **Changed** the resend cooldown from 60 s to 30 s as in the prompt, and updated the business rules.
- **Found by tests and fixed**: a deadlock when two invitees accept the last team place at the same time (lock order team, student, invitation); name and nickname limits that did not match the database columns; the Leaflet map covering the round menu button; a quiz timer that showed "expired" for one frame.
- **Rejected** the idea of copying the Figma folder's own `AGENTS.md` and `CLAUDE.md` into the project (they belong to the export, not to this project); only its sources were kept as a reference in `design/prototype/`.
- **Not done / open**: real checkpoint coordinates and radii, real quiz questions (everything seeded is a PLACEHOLDER), SMTP settings, real-phone location test, production hosting with HTTPS, a PNG export of the ER diagram, a modern tile provider for production. Nothing was pushed and no merge request was opened.

## Second session: follow the new campusGO prototype (2026-10-27)

- **Objective:** The project manager attached a second Figma Make export ("campusGO Prototype Design after prompt") and asked to change the application to follow it, because they liked how it feels.
- **Prompt:** "I have just attached the campusGO prototype design from figma make that is after the prompt that I gave it. I like their idea. Are you able to change the application to better fit and improve on it?"
- **What the prototype changed:** DHBW red and anthracite instead of the arcade colours, light and dark theme, Source Sans 3, soft shadows, a red hexagon GO badge with full-width menu bars, a red stripe on every page change, diamond pins, a radar location screen, a read-first info page, player cards with avatars, German and English, font size setting, a bonus-round screen, a podium ranking.
- **Backend changes (tested):** migration 002 (`avatar_preset`, `checkpoint_facts`), facts and best score on the checkpoint list, rank in `/me`, rank before and after plus the next multiplier in the result, pending invitations as open slots (no invitee address), avatar preset endpoint, field limits that match the database. Backend tests: 87.
- **Frontend changes (tested):** all screens rebuilt in the new style, new routes `/locate/:id` and `/info/:id`, language store with German texts (and a test that fails for a missing translation), theme and font size settings. Frontend tests: 28; browser tests: 84 (six screen sizes), plus the full-stack smoke test.
- **Decisions:** taken over everything that fits the business rules; left out replaying a cleared checkpoint (BR21), leaving a team (OP-06), distance to a checkpoint (BR12, no location outside the check), error texts that reveal whether an invitee exists (R-43), demo accounts and the fake browser frame. The arena result stays valid for behaviour (focus, keyboard, timer) but no longer for the look. Details: `design/decisions.md` D5, D7, D11 to D14.
- **Found by tests and fixed:** the red page-change stripe widened the page by up to 45 px on phones (it is now clipped), avatar buttons overflowed a 360 px screen, a screenshot race with the stripe.
- **Open:** the prototype's content (facts, questions, German quiz texts) is not used because it is unverified; the seeded content stays PLACEHOLDER. The export folder in Downloads was not deleted this time because it was not requested.

## Third session: real map, demo data, admin area (2026-10-27)

- **Objective:** Real Bildungscampus locations, believable demo data, working invitations, photo carousel, walking route, admin area, name filter, account deletion. No git by the AI; the project manager stages and commits.
- **Prompt (summary):** map the 8 checkpoints to the given Google Maps links, limit zoom to Heilbronn, add place photos as a 5-second carousel, OSM pathfinder, mock data in the database, invitations that work (only for existing accounts, never past 5), admin (user CRUD, block, archive, report, logs, team and name management, German and English vulgarity list that does not block names like Cass), unique e-mail, delete my account, region lock, Dart if appropriate.
- **Decisions:** Dart rejected (JavaScript only). Region lock dropped by the project manager. Invitations keep the generic reply (R-43) but the Team page shows the pending slot and the server refuses more than 5 members plus open invitations. Admin account is `sekretariat.dski@heilbronn.dhbw.de`. Building B uses the map centre of the given link. Care.box and Shop.box share one midpoint.
- **Photos:** only freely licensed Wikimedia Commons photos were found, and none shows a single place; they are generic Bildungscampus views with credits and must be replaced with the team's own photos.
- **New rules:** BR26 to BR35 are proposals in `docs/business-rules.md` section 9 and need the team's approval. Backend work is isolated for Yuri: `design/yi_heng/backend-handover.md`.
- **Tests:** backend 104, frontend unit tests, 24 new browser tests (invitations, carousel, admin, delete account) on six sizes, full-stack smoke test.
- **Found and fixed:** the old race test for the last team place became impossible by design (surplus invitations are now written directly); the e2e invite loop raced with the form reset; the ranks smoke check assumed an empty database.

## Fourth session: merge of Yuri's preproduction, admin test mode, profiles, dashboard, pipeline (2026-10-28)

- **Objective:** Pull Yuri's `preproduction` into `wip/yi_heng/feature` (ours wins for design and photos, his database and backend kept), then: questions not reachable although the location is sensed; admin can test every quiz from anywhere; admin account pre-existing and undeletable; admin entry in the menu above Map; show the invited e-mail; player profiles from the solo ranking; admin dashboard with graphs; fix the GitLab pipeline.
- **Prompts (summary):** "pull from preproduction and fix the merge conflicts, keep ours as main, keep their database", then the list of seven changes, with `/arena --2 agents`, the impeccable skill and agents allowed, and AI logs, `.arena`, README, CLAUDE.md and other docs to be updated. The AI staged the merge (`git add`) and the project manager commits and pushes.
- **Merge:** the merge itself had no conflicts. Re-applying our uncommitted work conflicted in 11 files (seed, app, auth, geofencing doc, mock API, e2e and test files); Yuri's checkpoint data, rename Containers -> Sensoricum, mailer, geofence and security code were kept. Our migration became `005`; coordinates are Yuri's (OSM and on-site) instead of the Google Maps pins; the earlier stash `round3-before-yuri-merge` was kept as a backup.
- **Arena:** two agents designed the admin dashboard and navigation; a001 won 83 to 75 (test-mode contract, Berlin-day statistics, per-section errors). Spec saved in `design/yi_heng/admin-dashboard-spec.md`; the `.arena/` folder (task, attacks, defences, verdict) stays local because it is git-ignored.
- **Decisions:** admin id 1 instead of 0 (an AUTO_INCREMENT column does not take 0); the admin cannot be deleted in the services, no database trigger (needs SUPER privilege with binary logging); the invited address is shown to the team only (BR40); profile invitations show a display name; test mode is a server-side bypass; no shortcut chips in the menu.
- **Bug "questions not reachable":** could not be reproduced without a phone. The server flow, questions and checkpoint data were checked; likely causes are overlapping circles (the app then says "You are at X"), weak accuracy or a stale reading. The admin test mode allows testing every quiz and the location rules separately.
- **Pipeline:** the repository had no `.gitlab-ci.yml`, so GitLab used Auto DevOps, which cannot build an npm workspace project. A real pipeline was added (lint, format, backend tests with a MySQL service, frontend tests, build, manual browser job). It was validated locally only; GitLab itself was not run.
- **Tests:** backend 156, frontend 34, browser tests on six sizes, full-stack smoke test with the admin. Found and fixed: the vitest forked worker crashed at random (now threads), the invite e2e raced, menu unit test needed a session.

### Follow-up the same day: lenient geofence

- **Problem:** a student standing at Building B could not start the quiz.
- **Change:** accuracy limit 50 to 100 m, a 25 m grace zone on every radius, and a 20 m margin before the app says "you are at another checkpoint" (settings in `backend/.env`; the mock API follows). Tests updated and added (`geofence-lenient.test.js`).
- **Open question:** Yuri's Building B position (OpenStreetMap, 49.147126 / 9.218486) is about 110 m from the Google Maps link position (49.1473112 / 9.2169587). If Building B is really at the second one, the circle is in the wrong place and the grace zone does not help; the centre must be corrected in the database.

### Follow-up 2026-10-29: database down, port 3000 busy, tests

- **Login failed with `ECONNREFUSED 127.0.0.1:3307`:** Docker Desktop had closed, so the MySQL container was down. Docker was started again; data was intact. The backend now says so once in plain words (`[db] MySQL is not reachable ...`).
- **`EADDRINUSE :::3000`:** a test API that the AI had started to check logins was still running and held the port. It was verified by its command line and stopped. `backend/index.js` now prints one clear line (`describeListenError`, `backend/src/listen-error.js`, unit-tested) instead of a stack trace when the port is taken.
- **Test fixes:** the admin browser test matched "Allowed." ambiguously (a sentence on the page also contains "allowed"); the real-stack admin test reused one address and hit its resend cooldown and hourly code limit, so the Playwright-started server now relaxes those two limits (`playwright.fullstack.config.js`).
- **Results:** `npm run check` (lint, format, 164 backend tests, 34 frontend tests, build), 132 browser tests on six sizes, 4 real-stack runs in a row, all passing.

## Fifth session: admin point reset, team ranking rules, the `tests/` folder (2026-10-29)

- **Objective:** (1) an admin can test quizzes and get points but is in no ranking, and can reset the points with a button on the map instead of the rank chip; (2) students in a team see the team rank after a quest, and a team with an admin is not ranked at all; (3) the team score is the average of the members' points, rounded up; (4) a `tests/` folder with every kind of test, all passing, restarting everything on an error. No git except `git add`.
- **Prompts (summary):** `/arena --2 agents` with the four requests, "make no mistakes and make sure that all tests pass, if there are errors restart all the tests", and "log everything in the AI logs, README, CLAUDE.md, .gitignore, brief and anything else".
- **Arena:** two agents designed the test architecture; a001 won 89 to 80.5 (one runner with a manifest, own ports and database safety, restart-all with a verdict rule, coordinate canary test). Spec: `design/yi_heng/test-architecture-spec.md`; the full record stays in the git-ignored `.arena/`.
- **Findings:** the team score was already `ceil(average)`, but it counted blocked and archived members and admins, nothing said "average" in the UI, and teams with an admin were ranked. All fixed and locked by tests (BR43, BR42).
- **Decisions:** admin reset deletes the admin's attempts, answers and location checks (the total alone would leave "passed is final" in the way); one shared "ranked team" rule (`team-ranking.js`); existing suites stay where they are and the new folder references them; Python only for the black-box suites; `npm run check` stays JavaScript-only, `check:all` adds Python and the whole runner; the admin bar of the test suite never touches the development database.
- **Bugs the new tests found and fixed:** the 320 px profile page was 18 px too wide (preset avatars and a grid column without `minmax(0, 1fr)`), the dark-mode switch was 30 px high (now a 44 px touch target), the map credit link had no underline and poor contrast, the login helper waited for a rank chip that admins no longer have.
- **Rules:** BR41 to BR43 are proposals in `docs/business-rules.md` section 9.
- **Results:** the first full run stopped on a real failure (after deleting an account the app went to the login screen instead of the start page; fixed in `Profile.jsx`), so all tests were restarted; the second full run of `npm run test:all` passed all 18 categories on the first attempt (lint, format, black, pylint 10/10, pytest unit, node:test, 173 backend tests, 34 frontend tests, build, database, integration, security, regression, 132+ end-to-end tests, UI/UX, browser, full stack, performance).

