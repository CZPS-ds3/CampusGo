# AI Log — geofencing, OTP e-mail, security review, checkpoints

- **Date:** 2026-10-27
- **Team member:** yuri
- **AI tool / model:** Claude Code (Opus 5.5, later Sonnet 5.5)
- **Objective:** Align the backend with the Main Project Document (geofencing, business rules, scoring), make the OTP login send real e-mail, review the code against the OWASP Top 10, and put the 8 checkpoints on the DHBW Heilbronn Bildungscampus.

## AI Prompts Used
1. Fix the backend to follow the Main Project Document, check the geofencing implementation, make OTP login really send e-mail, review the whole codebase against the OWASP Top 10, check all business and scoring rules, and move the checkpoints to the real campus.
2. How do I run the app?
3. Add the DHBW containers, next to Building C.
4. Use my current location for it, call it Sensoricum.
5. Rename "Containers" to "Sensoricum" in all documents, and make sure standing in Building C never unlocks the Sensoricum and the other way round.

## Decisions Made
- **Merged `origin/preproduction`** into `wip/yuri/feature` first, because the backend only existed there.
- **Geofencing:** replaced the two-step location-check + start with one `POST /checkpoints/:id/verify` (freshness 30 s, accuracy 50 m, Haversine, unlock and timer in one transaction, 10 calls per minute per student), as in the document. The read-first page now comes before the location check, so reading costs no quiz time.
- **Checkpoint coordinates:** taken from OpenStreetMap features by name (checked 2026-10-27). They still need the on-site test (WP13). Mensa, CAS Cafe and Campus Garden positions are to be confirmed on site.
- **Sensoricum:** the old "Containers" checkpoint, renamed at the user's request and placed at the user's own location (grey building beside the car park, next to Building C). Active. The rename changes BR07, so the team has to approve it.
- **Nearest-centre rule (own addition, not in the document):** a reading inside several circles unlocks only the checkpoint with the nearest centre, so Building C and Sensoricum (34 m apart) never both unlock. Needs team approval.
- **OTP e-mail:** the sending code already existed; added enforced TLS, a start-up SMTP check, an HTML mail and a production start-up check (no default secrets, SMTP required). Nothing is sent until `SMTP_*` is filled in `backend/.env`.
- **Security:** upgraded nodemailer, sharp, zod, multer, react-router and vitest (`npm audit`: 11 findings to 0); same-origin check on state-changing requests; ownership checked before attempt reads; `trust proxy` only via `TRUST_PROXY`; old sessions are purged; dev OTP route off when SMTP is set; `backend/uploads/` untracked and git-ignored. The committed profile picture remains in git history (removal needs a force-push, left to the team).
- **BR10:** questions without exactly 4 options and exactly 1 correct one are never drawn.
- **Scoring rules** were checked against the code and were already correct; no change.
- **Not verified:** the database-backed backend tests (no Docker or MySQL on this machine). Everything else (backend unit tests, frontend tests, Playwright, lint, build) passed. `format:check` still fails on `frontend/.impeccable/config.json`, which was already failing on `preproduction`.
- **Rejected:** a separate "Containers" inactive placeholder (the user supplied the real location instead).
