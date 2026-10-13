# CLAUDE.md — AI Assistant Instructions

> **CRITICAL: Read this file and docs/git-workflow.md before processing any prompt.**
> This applies to every AI assistant (Claude Code, Copilot, ChatGPT, Gemini, Cursor, etc.) and to every task, including small ones. If you have not read both files in this session, stop and read them first. Where the two files conflict, `docs/git-workflow.md` wins.

## Project Overview

**Campus & City Quest** (Project No. DHBW-INT-2027-01) is a gamified, mobile-responsive web application that helps incoming international students at DHBW Heilbronn explore the campus (Pokémon GO style).

Key features:
- **Live-location verification** (browser Geolocation API): a student must be inside a checkpoint's radius to unlock its info page and quiz. No NFC, card readers or extra hardware.
- Flow per visit: arrival verified -> read-first info page (no time limit) -> student presses Start -> 5 questions with a server-side 5-minute timer -> pass at >= 80% (4 of 5).
- The student must stay at the place: no accepted in-radius location sample for > 30 s cancels the attempt (retry after a 2-minute cooldown). Samples need accuracy <= 50 m and plausible movement.
- Points: 10 per correct answer, +10 for 5/5, speed bonus `remaining_seconds / 300 * 20`, attempt multiplier 1.0 / 0.6 / 0.3; only the first pass of a location scores.
- Live leaderboards (individual, duo, nationality) are a Should item.

Out of scope: city locators (Rewe, Lidl, clothing stores) and Google Maps; native iOS/Android apps; NFC tags / student-card readers; modifying official university databases.

Full plan: `docs/project_handbook.md`. Setup: `requirements.md`.

Team: Catalina, Yuri, Ryan, Yi Heng (Project Manager), Akil.

## Repository Layout

```
ai-logs/<member>/     Per-member AI session logs (catalina, yuri, ryan, yi_heng, akil)
.gitlab/              Issue and merge request templates
CLAUDE.md             This file
requirements.md       What to install (npm only)
package.json          npm scripts and dev dependencies (ESLint, Prettier, Vitest)
docs/git-workflow.md  Git branching strategy and workflow
project_chater.md     Project charter
docs/project_handbook.md  Full project plan
```

Application code is added under `src/` and tests under `tests/` once development starts.

## Build / Run Commands

The project uses Node.js (LTS, v20 or newer) and **npm only** (no yarn/pnpm). See `requirements.md`.

| Task | Command |
|------|---------|
| Install dependencies | `npm ci` |
| Lint (ESLint) | `npm run lint` |
| Lint and auto-fix | `npm run lint:fix` |
| Check formatting (Prettier) | `npm run format:check` |
| Format | `npm run format` |
| Run tests (Vitest) | `npm test` |
| **All checks** | `npm run check` |

Start/build scripts (`dev`, `build`) are added to `package.json` once the application stack is chosen (WBS 2.2); do not invent them before then.

Rules:
- Use `npm ci` for a clean install; use `npm install <pkg>` only when deliberately adding a dependency, and commit `package-lock.json`.
- Never commit `node_modules/`, build output, or `.env` files.
- Secrets (database URL, session secret) live in `.env` locally and are documented by name only in `.env.example`. Never hard-code or print them.
- `pylint` is a Python tool (pip, not npm). It is only relevant if Python code is ever added; see `requirements.md` section 8.

## Linting / Testing

Before proposing a commit or Merge Request, run `npm run check` (ESLint + Prettier + Vitest) and make sure it passes. If a check fails, fix the cause; do not disable the rule or delete the test. State clearly in your reply if you were unable to run a check. Add tests for new logic (especially the quiz rules: radius and accuracy checks, 30-s leave rule, 5-minute limit, 80% pass, scoring).

## Code Style Guidelines

- **Language**: JavaScript (ES modules, `"type": "module"`). Use `const`/`let`, strict equality, no unused variables (enforced by ESLint).
- **Formatting**: Prettier (see `.prettierrc`): 2-space indentation, single quotes, semicolons, trailing commas, 100 columns.
- **Naming**: `camelCase` for variables and functions, `PascalCase` for classes and components, `UPPER_SNAKE_CASE` for constants, `kebab-case` for file names.
- **Structure**: Small, single-purpose functions and components. Prefer composition over inheritance. No dead code or commented-out code.
- **Comments**: Explain *why*, not *what*. Public functions get a short doc comment.
- **Error handling**: Never swallow errors silently. Validate all external input (location samples, answers, API responses, form data).
- **Privacy**: Location is personal data. Require consent, store only "inside radius yes/no + timestamp", never store or log raw coordinates, and never include real student locations in tests, fixtures, or commits. All timing and location decisions are made on the server, never trusted from the client.
- **UI**: Mobile-first and responsive; interactive elements must be accessible (labels, contrast, keyboard focus).
- **Dependencies**: Do not add a new dependency without stating why in the MR description.
- **Scope**: Change only what the task requires. Do not refactor unrelated code.

## Git Workflow (summary — see docs/git-workflow.md)

- Branch strategy: `main` <- `preproduction` <- `wip/[name]/feature` and `wip/[name]/bugfix` (each person owns these two permanent branches; `wip` and `[name]` are folder prefixes).
- **Nobody merges a feature branch into `main`.** Only the project lead merges `preproduction` into `main` at a milestone.
- Never push directly to `main` or `preproduction`. Open a Merge Request from the user's own branch into `preproduction`, with "Delete source branch" unticked.
- Work only on the user's own `wip/[your_name]/feature` or `wip/[your_name]/bugfix` branch; never delete these branches and never push to another member's branch. The task is named in commit messages and the MR title. Names: catalina, ryan, yuri, akil, yi_heng.
- Issue/MR titles start with a tag: `FEATURE:`, `BUG-FIX:` (e.g. `BUG-FIX: Fixing feature 1 issue of GPS jitter cancelling the quiz`), `DOCS:`, `REFACTOR:`.
- Commit messages follow Conventional Commits, e.g. `feat: add quiz timer`, `fix: resolve crash`.
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
