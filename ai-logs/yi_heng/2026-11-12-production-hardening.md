# AI Log — Production hardening before deployment

- **Date:** 2026-11-12
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code, Opus
- **Objective:** Fix the issues found in the review after the third preproduction merge before the app is deployed
  on the Ubuntu server, add regression tests and run every test category except the 6-size browser suite.

## AI Prompts Used
1. "is there anything that you think isnt right or anything that should be changed or updated" (review)
2. "Please fix all of the issues stated in here ... Run all of the test also afterwards and also make regression
   tests ... You do not need to run all the UI test for the 6 screen sizes. make sure none of the things times out"

## Decisions Made
- Fake client IPs (rate-limit bypass): nginx believes `X-Forwarded-For` only from `TRUSTED_PROXIES` (new, required
  in `.env.production`) and passes one address to the API, `TRUST_PROXY` fixed to 1; port bind via `HTTP_BIND`.
  Chosen over a ufw-only fix because Docker-published ports skip ufw. Checked in a real nginx container (fake IP
  ignored, trusted proxy's IP used, injected values refused). Recorded as D41.
- The API container gets only its own settings instead of the whole `.env.production` (no MySQL root password).
- New `scripts/backup-prod.sh` (database dump + pictures, 14 days, owner-only) with cron and restore steps in the
  README (risk R13). The dump command was tried on the local database.
- Placeholder content: the API start logs a warning and the admin dashboard shows a banner while PLACEHOLDER
  questions, facts or descriptions are live (BR11); the count bypasses the 30-second stats cache.
- Removed the stale doc comment in `seed.js`; raised the "Locked on!" wait in the browser tests to 25 s.
- Not done: seeding the real question bank from the "Main Project Document" PDF (content decision for the team).
- Tests: backend `placeholders.test.js`, frontend `admin-placeholders.test.jsx`, updated Docker file tests and six
  new regression tests. Nothing was committed by the AI; Yi Heng commits and pushes.
