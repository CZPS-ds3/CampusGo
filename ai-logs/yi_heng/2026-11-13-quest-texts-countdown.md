# AI Log — Real quest texts, all questions drawn, 3-2-1 countdown

- **Date:** 2026-11-13
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code, Opus
- **Objective:** Replace the placeholder quest information with texts that answer the questions, make every question
  of the bank drawable, and show a 3-second countdown after the location check before the quiz starts.

## AI Prompts Used
1. "are you able to fix the backend issue? my friends one did not need a smtp secure to ensure that the email are sent."
2. "remove all of the placeholder questions and information and give information that would be needed to answer the
   questions ... have a 3 second countdown timer shown to them before starting the test. Make it is so that all of the
   actual questions are used."

## Decisions Made
- SMTP: no code change. `SMTP_SECURE` is already optional (taken from the port); e-mails failed because every
  `SMTP_*` value in my local `backend/.env` was empty. I fill them in myself (Gmail app password).
- Quest descriptions and up to 5 facts per quest (`QUEST_INFO` in `backend/src/db/question-bank.js`) are written only
  from the team's questions: every normal question can be answered from them (checked by
  `backend/tests/quest-content.test.js`). Hard questions only say where to look, so they stay an on-site challenge.
- The seed replaces the placeholder descriptions and facts once (marker `quest_content_v1`); admin edits are kept.
- All questions used: chose to set Library and Building B to "mixed" once, so their two multi-select questions are
  drawn (every attempt there contains that one multi-select question). The mock now serves the real bank too
  (generated copy, `npm run questions:sync`). Test databases keep their placeholder questions as fixtures.
- Countdown (R-66, needs the team's approval): the server starts the attempt 3 s after the unlock and moves the
  deadline back by the same 3 s, so no quiz time or time bonus is lost; no questions are sent and no answers accepted
  before the start. The quiz page shows "Locked on!" and 3-2-1-Go. Tests run with `QUIZ_COUNTDOWN_SECONDS=0` except
  the dedicated countdown tests.
- BR13 and R-62 wording in `docs/business-rules.md` changed and R-66 added: needs the team's approval. Nothing was
  committed by the AI.
