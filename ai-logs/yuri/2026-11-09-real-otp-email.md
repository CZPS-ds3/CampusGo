# AI Log — real OTP e-mail delivery

- **Date:** 2026-11-09
- **Team member:** yuri
- **AI tool / model:** Claude Code, Sonnet 5.5
- **Objective:** Stop printing OTP codes in the backend terminal and send them by e-mail (Gmail SMTP) to the address that logs in. Rename the e-mail and browser tab to "DHBW campusGO".

## AI Prompts Used
1. Remove the terminal OTP feature and send real OTP e-mails from a Gmail account.
2. Is an app password a must? (Yes: Gmail SMTP rejects the normal account password; an app password was created.)
3. No e-mail received: diagnose (SMTP verified, direct test mail arrived).
4. Change the e-mail subject, sender name and text to "DHBW campusGO"; check how large a repo-wide rename would be.
5. Change only the browser tab title to "DHBW campusGO".

## Decisions Made
- Removed the console fallback in the mailer, the dev-only `/api/dev/last-otp` route, the relaxed resend limits in development and the "printed in the terminal" hints in the login page.
- Credentials live only in the git-ignored `backend/.env`; `.env.example` has names only.
- Added a `[mail] sent (accepted/rejected counts)` log line without address or code, to diagnose delivery.
- Repo-wide rename rejected for now (docs, database and package names stay as they are); only the e-mail and the tab title changed.
- Not done: the Python, Playwright full-stack and `tests/lib` suites still use `/api/dev/last-otp` and need another way to read codes.
