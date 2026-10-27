# AI Log — Repository setup, planning documents and Git workflow

- **Date:** 2026-10-13 (session start about 09:54, last commit 15:37; times from `git log`, other steps approximate)
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code (Sonnet 5.5)
- **Objective:** Build a clean repository baseline for the 5-person group project, format the project charter, and write the project handbook required by the course (nine parts + "Use of AI Tools").

## Timeline (2026-10-13)

| Time | What happened |
|---|---|
| ≈09:54 | Repository created on the DHBW WI GitLab (`Initial commit`). |
| ≈10:00–12:07 | Generated `CLAUDE.md`, `CONTRIBUTING.md` (later removed), `.gitignore`, GitLab issue/MR templates, `ai-logs/<member>/` folders, `scripts/setup-repo.sh`; reformatted `project_chater.md` into Markdown tables. Commit 12:07 `chore: add repository baseline and project docs`. |
| ≈12:10–14:30 | Course slides (project planning, handbook parts) turned into `docs/project_handbook.md` (objectives MoSCoW, WBS, schedule/Gantt, roles/RACI, effort, communication, risks, budget, tools, time tracking, AI-use section). Charter filled in. Git workflow changed to `main` ← `preproduction` ← feature branches; Git Basics section added to the README. npm tooling added (`package.json`, ESLint, Prettier, Vitest, `requirements.md`). |
| ≈14:30–15:29 | Plan changed from NFC/ESP32 stations to **live-location verification**; handbook, charter, README, CLAUDE.md rewritten. Commit 15:29 `feat: switch to live-location quiz, wip branch workflow and npm tooling`; merge request !1 opened (branch `wip/yi_heng/feature/live-location-docs-and-tooling`). |
| 15:36–15:37 | Branch layout changed to `wip/<name>/feature` and `wip/<name>/bugfix` for the 5 members; MR content fast-forwarded into `preproduction` and `main`; 10 personal branches created and pushed; old `develop` and temporary branch deleted. Commits 15:36 and 15:37. |

## AI Prompts Used
1. Generate `CLAUDE.md`, `CONTRIBUTING.md` and `.gitignore`, folder structure with `ai-logs/<name>/`, and make the charter look nicer.
2. Put the course requirements (nine plan parts, AI-use disclosure, time tracking) into a full handbook; fill the charter with team data.
3. Change the Git workflow (main / preproduction / feature branches with names), remove CONTRIBUTING.md, add npm tooling and `requirements.md`.
4. Add a "how to use Git" section to the README.
5. Replace NFC readers with phone live location; time limits and "don't leave the place".
6. Open a merge request; later merge everything into GitLab `main`, clean up branches, create the 10 `wip/...` branches.

## Decisions Made
- **Accepted:** branch model `main` ← `preproduction` ← `wip/<name>/feature|bugfix`; Conventional Commits; MR tags (`FEATURE:`, `BUG-FIX:` …); npm only.
- **Changed from the AI draft:** CONTRIBUTING.md was removed (not wanted); NFC/ESP32 hardware dropped; branch naming changed because Git cannot hold `wip/x/feature` and `wip/x/feature/task` together.
- **Assumptions to verify:** per-person hour splits, €30/h rate, budget numbers and role names are AI-proposed planning assumptions (marked as such in the handbook).
- **Limits found:** the AI could not set GitLab branch protection or required approvals (needs GitLab settings); the 90%/30-day KPI cannot be measured inside a 34-day project, so a pilot proxy was proposed.

## Changes (files)
`CLAUDE.md`, `.gitignore`, `.gitlab/` templates, `ai-logs/` folders, `scripts/setup-repo.sh`, `README.md`, `project_chater.md`, `docs/project_handbook.md`, `docs/git-workflow.md`, `package.json`, `package-lock.json`, `eslint.config.js`, `.prettierrc`, `.env.example`, `requirements.md`.
