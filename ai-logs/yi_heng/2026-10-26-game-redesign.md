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
