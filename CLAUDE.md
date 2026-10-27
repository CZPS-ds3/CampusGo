# CLAUDE.md — AI Assistant Instructions

> **CRITICAL: Read this file and docs/git-workflow.md before processing any prompt.**
> This applies to every AI assistant (Claude Code, Copilot, ChatGPT, Gemini, Cursor, etc.) and to every task, including small ones. If you have not read both files in this session, stop and read them first. Where the two files conflict, `docs/git-workflow.md` wins.

## Project Overview

**Campus & City Quest** (Project No. DHBW-INT-2027-01) is a gamified, mobile-responsive web application that helps incoming international students at DHBW Heilbronn explore the campus like a location-based game by verifying their location at 8 checkpoints and taking short quizzes.

**Source of truth:** `docs/business-rules.md` (BR01-BR25 + resolutions R-nn + scoring examples + acceptance checks). Entities and constraints: `docs/data-model.md`. Location: `docs/geofencing.md`. Questions: `docs/question-bank.md`. Rule-to-test matrix: `docs/traceability.md`. Plan: `docs/project_handbook.md`. If code, tests or other docs contradict `docs/business-rules.md`, the business rules win; to change a rule, edit that file first (with the team's approval).

Key rules in short (read the file before implementing):
- **Login (BR01-03):** OTP by e-mail only, no passwords. The e-mail must end with `heilbronn.dhbw.de`. Login responds generically ("If the account exists, an email containing the OTP has been sent."). One active session per student; sessions expire after inactivity. OTP codes and session tokens are stored only as hashes.
- **Teams (BR05, BR06):** 1-5 members, one team per user, invitations by e-mail (accept/reject, 24 h expiry). Team leaderboard = ceil(average of members' total points), only teams with >= 2 members, visible only to users in a team.
- **Checkpoints (BR07-08):** 8 pilot checkpoints (Mensa, Library, CAS Cafe, Campus Garden, Care.box and Shop.box, Building B, Building C, Containers). Only active ones unlock quizzes.
- **Location (BR12):** verified by the server when an attempt starts (browser Geolocation API). Poor accuracy or denied permission = check again, without consuming an attempt or starting the timer. Leaving the geofence afterwards does NOT end the attempt. There is no 30-second leave rule.
- **Quiz (BR09-10, 13-15, 20-23, 25):** random 3 or 5 distinct questions, 4 options each, 1 minute per question (one deadline per attempt, server clock), no retry, right answer revealed after a wrong answer, pass at 4/5 or 2/3, a passed checkpoint is final, every attempt is a new record, question set and state survive refresh/reconnect.
- **Scoring (BR14, 16-21):** normal 1,000, hard 2,000, time bonus 1 per whole remaining second, full clear 200, attempt multipliers 100/85/70/55/40/0 % applied after bonuses, hard-question option only on attempt 1 of the 4 large checkpoints, fractions rounded up. **Points, bonuses and multipliers are read from database tables (BR11), never hard-coded.**
- **Server authority (BR22):** answers and submissions are accepted only while the attempt is active and before it expires, judged on the server clock. Never trust the client for time, location or correctness.
- **Leaderboards (BR04, 24):** solo (total points) and team; equal scores share a rank, earlier achiever listed first.
- Not in scope: city locators, Google Maps, native apps, NFC/student cards, duo/nationality leaderboards, an admin UI.
- The read-first info page (before the quiz) is a Should item.

Team: Catalina, Yuri, Ryan, Yi Heng (Project Manager), Akil.

## Repository Layout

```
ai-logs/<member>/     Per-member AI session logs (catalina, yuri, ryan, yi_heng, akil)
.gitlab/              Issue and merge request templates
backend/              Express API (index.js, src/routes|services|db|middleware, tests/, .env.example)
frontend/             React + Vite app (src/api|components|hooks|pages|styles, tests/, e2e/, .env.example)
design/               Architecture, ER diagram, API docs, decisions, UI spec, prototype reference, screenshots
docs/                 business-rules.md (SOURCE OF TRUTH), data-model, geofencing, question-bank, traceability, git-workflow, project_handbook
docker-compose.yml    MySQL 8.4 for development and tests
scripts/              setup.mjs (after npm install), ensure-db.mjs (starts the database)
CLAUDE.md, README.md, requirements.md, project_brief.md, project_chater.md
```

## Build / Run Commands

The project uses Node.js (LTS, v20 or newer), **npm only** (no yarn/pnpm), npm workspaces (`frontend`, `backend`) and Docker Desktop for MySQL. See `requirements.md`.

| Task | Command |
|------|---------|
| Install (also creates the `.env` files) | `npm install` (clean: `npm ci`) |
| Start MySQL, migrate, seed, run API (3000) and web app (5173) | `npm run dev` |
| Web app only with in-browser mock API (no Docker) | `npm run dev:mock` |
| Lint / auto-fix (ESLint, zero warnings) | `npm run lint` / `npm run lint:fix` |
| Check formatting / format (Prettier) | `npm run format:check` / `npm run format` |
| Backend + frontend tests (Vitest) | `npm test` |
| Browser tests on phone, tablet, laptop sizes (Playwright) | `npm run test:e2e` |
| Smoke test through the real stack | `npm run test:e2e:full` |
| Build the web app | `npm run build` |
| Database | `npm run db:up`, `db:down`, `db:reset`, `db:migrate`, `db:seed` |
| **All checks** (lint + format + tests + build) | `npm run check` |

Rules:
- Use `npm ci` for a clean install; use `npm install <pkg>` only when deliberately adding a dependency, and commit `package-lock.json`.
- Never commit `node_modules/`, build output, uploads or `.env` files.
- Secrets (database URL, session and OTP secrets, SMTP credentials) live in `backend/.env` and are documented by name only in `backend/.env.example`. Never hard-code or print them.
- Seed data (checkpoint coordinates, questions) is **placeholder** until replaced; never present it as real.
- `pylint` is a Python tool (pip, not npm). It is only relevant if Python code is ever added; see `requirements.md` section 8.

## Linting / Testing

Before proposing a commit or Merge Request, run `npm run check` (ESLint + Prettier + Vitest) and make sure it passes. If a check fails, fix the cause; do not disable the rule or delete the test. State clearly in your reply if you were unable to run a check. Add tests for new logic and **name the business rule in each test** (e.g. `BR19 attempt 2 applies 85% after bonuses`). The 15 worked scoring examples and the 25 acceptance checks in `docs/business-rules.md` must exist as automated tests. Money-like arithmetic is integer arithmetic (no floating point for points).

## Code Style Guidelines

- **Language**: JavaScript (ES modules, `"type": "module"`). Use `const`/`let`, strict equality, no unused variables (enforced by ESLint).
- **Formatting**: Prettier (see `.prettierrc`): 2-space indentation, single quotes, semicolons, trailing commas, 100 columns.
- **Naming**: `camelCase` for variables and functions, `PascalCase` for classes and components, `UPPER_SNAKE_CASE` for constants, `kebab-case` for file names.
- **Structure**: Small, single-purpose functions and components. Prefer composition over inheritance. No dead code or commented-out code.
- **Comments**: Explain *why*, not *what*. Public functions get a short doc comment.
- **Error handling**: Never swallow errors silently. Validate all external input (location samples, answers, API responses, form data).
- **Privacy**: E-mail, names, pictures and location are personal data. Require consent for location, store only "inside radius yes/no + timestamp", never store or log raw coordinates, never log OTP codes or tokens, never show e-mail addresses or last names to other users, and never include real student data or locations in tests, fixtures, or commits. All timing and location decisions are made on the server.
- **UI**: Mobile-first and responsive; interactive elements must be accessible (labels, contrast, keyboard focus).
- **Dependencies**: Do not add a new dependency without stating why in the MR description.
- **Scope**: Change only what the task requires. Do not refactor unrelated code.

## Git Workflow (summary — see docs/git-workflow.md)

- Branch strategy: `main` <- `preproduction` <- `wip/[name]/feature` and `wip/[name]/bugfix` (each person owns these two permanent branches; `wip` and `[name]` are folder prefixes).
- **Nobody merges a feature branch into `main`.** Only the project lead merges `preproduction` into `main` at a milestone.
- Never push directly to `main` or `preproduction`. Open a Merge Request from the user's own branch into `preproduction`, with "Delete source branch" unticked.
- Work only on the user's own `wip/[your_name]/feature` or `wip/[your_name]/bugfix` branch; never delete these branches and never push to another member's branch. The task is named in commit messages and the MR title. Names: catalina, ryan, yuri, akil, yi_heng.
- Issue/MR titles start with a tag: `FEATURE:`, `BUG-FIX:` (e.g. `BUG-FIX: Fixing feature 1 issue of OTP code rejected after a resend`), `DOCS:`, `REFACTOR:`.
- Commit messages follow Conventional Commits, e.g. `feat: add quiz timer`, `fix: resolve crash`.
- Name the business rules (BR..) in issue and MR descriptions.
- Never run destructive commands (`git push --force`, `git reset --hard`, deleting branches) unless the user explicitly asks.

## AI Interaction Logging Rule

Every use of an AI tool by a team member must be documented. **At the end of each session, remind the user** to create or append a log file in their own folder:

```
ai-logs/[user_name]/YYYY-MM-DD-[short-topic].md
```

`[user_name]` is one of: `catalina`, `yuri`, `ryan`, `yi_heng`, `akil`. If you do not know who the user is, ask.

Use exactly this format (keep it concise):

```markdown
# AI Log — [short topic]

- **Date:** YYYY-MM-DD
- **Team member:** [name]
- **AI tool / model:** [e.g. Claude Code, Sonnet]
- **Objective:** [one or two sentences on what the user wanted to achieve]

## AI Prompts Used
1. [prompt, summarized or quoted]
2. [prompt, summarized or quoted]

## Decisions Made
- [what was accepted, rejected, or changed from the AI's output, and why]
```

If the user agrees, offer to write the log file for them. If several sessions happen on the same day for the same topic, append to the existing file instead of creating a new one. Never write into another member's folder.

## Behaviour Expectations for AI Assistants

1. Read `CLAUDE.md` and `docs/git-workflow.md` first (see the critical rule at the top).
2. Ask when a requirement is ambiguous instead of guessing.
3. Do not invent APIs, file paths, or facts about this project; check the repository.
4. Report results honestly: say when tests fail or something was not verified.
5. Remind the user about the AI log (see above) when the task is finished.
