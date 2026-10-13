# CLAUDE.md — AI Assistant Instructions

> **CRITICAL: Read this file and docs/git-workflow.md before processing any prompt.**
> This applies to every AI assistant (Claude Code, Copilot, ChatGPT, Gemini, Cursor, etc.) and to every task, including small ones. If you have not read both files in this session, stop and read them first. Where the two files conflict, `docs/git-workflow.md` wins.

## Project Overview

**Campus & City Quest** (Project No. DHBW-INT-2027-01) is a gamified, mobile-responsive web application that helps incoming international students at DHBW Heilbronn explore the campus and the city (Pokémon GO style).

Key features:
- Checkpoint collection using a three-tier interaction hierarchy: DHBW Student ID card UID readers (primary), NFC tags (secondary), QR codes (universal fallback).
- Interactive map (Google Maps API) and a searchable item database for supermarkets (Rewe, Lidl, etc.) and everyday essentials.
- Live leaderboards: solo, duo, team, and nationality/country.

Out of scope: native iOS/Android apps; modifying official university databases (student ID UIDs are mapped in our own independent database).

Team: Catalina, Yuri, Ryan, Yi Heng (Project Manager), Akil.

## Repository Layout

```
ai-logs/<member>/     Per-member AI session logs (catalina, yuri, ryan, yi_heng, akil)
.gitlab/              Issue and merge request templates
CLAUDE.md             This file
docs/git-workflow.md  Git branching strategy and workflow
project_chater.md     Project charter
```

Application code is added under `src/` and tests under `tests/` once development starts.

## Build / Run Commands

The project uses Node.js (LTS, v20 or newer) and npm.

| Task | Command |
|------|---------|
| Install dependencies | `npm ci` |
| Start dev server | `npm run dev` |
| Production build | `npm run build` |
| Preview production build | `npm run preview` |

Rules:
- Use `npm ci` (not `npm install`) for a clean install; only use `npm install <pkg>` when deliberately adding a dependency, and commit `package-lock.json`.
- Never commit `node_modules/`, build output, or `.env` files.
- Secrets (e.g. the Google Maps API key) live in `.env` locally and are documented by name only in `.env.example`. Never hard-code or print them.

## Linting / Testing

| Task | Command |
|------|---------|
| Lint | `npm run lint` |
| Auto-fix lint issues | `npm run lint -- --fix` |
| Format check | `npm run format:check` |
| Format | `npm run format` |
| Run all tests | `npm test` |
| Run one test file | `npm test -- <path-to-test-file>` |

Before proposing a commit or Merge Request, run `npm run lint` and `npm test` and make sure both pass. If a check fails, fix the cause; do not disable the rule or delete the test. State clearly in your reply if you were unable to run a check.

## Code Style Guidelines

- **Language**: TypeScript with `strict` enabled. Avoid `any`; use `unknown` and narrow instead.
- **Formatting**: Prettier defaults with 2-space indentation, single quotes, semicolons, and a trailing newline.
- **Naming**: `camelCase` for variables and functions, `PascalCase` for types and components, `UPPER_SNAKE_CASE` for constants, `kebab-case` for file names.
- **Structure**: Small, single-purpose functions and components. Prefer composition over inheritance. No dead code or commented-out code.
- **Comments**: Explain *why*, not *what*. Public functions get a short doc comment.
- **Error handling**: Never swallow errors silently. Validate all external input (QR payloads, NFC/card UIDs, API responses, form data).
- **Privacy**: Student ID card UIDs are personal data. Store them only in the project database, never log them, and never include real UIDs in tests, fixtures, or commits.
- **UI**: Mobile-first and responsive; interactive elements must be accessible (labels, contrast, keyboard focus).
- **Dependencies**: Do not add a new dependency without stating why in the MR description.
- **Scope**: Change only what the task requires. Do not refactor unrelated code.

## Git Workflow (summary — see docs/git-workflow.md)

- Branch strategy: `main` <- `develop` <- `feature/*`, `bugfix/*`, `docs/*`, `refactor/*`.
- Never push directly to `main` or `develop`. Always work on a branch created from `develop` and open a Merge Request into `develop`.
- Branch names include your name: `type/[your_name]/[short-description]`, e.g. `feature/catalina/auth-page`.
- Commit messages follow Conventional Commits, e.g. `feat: add login page`, `fix: resolve crash`.
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
