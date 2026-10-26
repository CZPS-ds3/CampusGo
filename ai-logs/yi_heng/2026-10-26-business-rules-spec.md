# AI Log — Business rules specification from the Main Project Document

- **Date:** 2026-10-26 (about 19:47 to 21:31; file times from the working tree, tournament steps approximate)
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code (Sonnet 5.5) with `/arena` (2 sub-agents + 1 judge)
- **Objective:** Document the team's newest "Main Project Document" (business rules BR01–BR25, entities, scoring tables, 8 checkpoints) in the brief, charter, README, CLAUDE.md, handbook and new specification files, so the team can start coding.

## Timeline (2026-10-26)

| Time | What happened |
|---|---|
| ≈19:30 | Questions answered: info page = Should; everything in BR01–BR25 = Must, effort raised to about 230 h; e-mail must end with `heilbronn.dhbw.de`. |
| 19:47 | `.arena/task.md` written (rules transcribed word for word) and `/arena --agents 2` started (spawn → attack → defend → judge). |
| ≈20:00 | Winner chosen (a002, 84 to 79.5). Split into `docs/business-rules.md` and `docs/data-model.md`; worked scoring examples re-computed with a separate script (all correct). |
| 20:02–20:08 | Created `docs/geofencing.md`, `docs/question-bank.md`, `docs/traceability.md`; rewrote `docs/project_handbook.md`, `CLAUDE.md`; updated `.env.example`, `requirements.md`, feature issue template. |
| ≈21:30 | Rewrote `project_brief.md`, `project_chater.md`, `README.md` (rules, checkpoints, scoring table). Prettier config set to `endOfLine: auto`. |
| 21:50 (approx.) | Committed on `wip/yi_heng/feature`: `docs: add business rules, data model and specs`. No merge request. |

## AI Prompts Used
1. "Document the Main Project Document into brief, charter, README, CLAUDE.md and everything else; make it ready to start writing the project" (with `/arena --2 agents`).
2. Answers to three clarification questions (info page, scope vs effort, school e-mail domain).
3. "Commit this into my wip/yi_heng/feature branch … do not open a merge request yet."

## Decisions Made
- **Rules win** over earlier ideas: the 30-second leave rule was removed (BR12), duo/nationality leaderboards dropped.
- **Everything in BR01–BR25 is Must**; effort 230 h (46/47/50/42/45 per person), budget €7,656; schedule dates kept (high risk: about 3 weeks for 190 implementation hours).
- **AI resolutions marked as assumptions/proposals** (OTP 10 min, session 30 min, accuracy 50 m, nickname column, `Location_Check` entity, rounding once per user, no leaving a team). The team must confirm them (`docs/business-rules.md` §7).
- **Question bank:** BR09 "2× normal questions" gives 10 normal questions for 5-question checkpoints; the source template shows 8 (flagged). Mensa sample question marked unverified.
- **Arena result:** the winning spec stores only "inside radius yes/no + timestamp" and applies BR04 rounding exactly; used as the base, checked by me against the transcribed rules.

## Changes (files)
New: `docs/business-rules.md`, `docs/data-model.md`, `docs/geofencing.md`, `docs/question-bank.md`, `docs/traceability.md`. Updated: `project_brief.md`, `project_chater.md`, `README.md`, `CLAUDE.md`, `docs/project_handbook.md`, `docs/git-workflow.md`, `.env.example`, `.gitignore` (`.arena/`), `.prettierrc`, `requirements.md`, `.gitlab/issue_templates/Feature.md`.
