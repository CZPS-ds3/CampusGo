# AI Log — location testing guide

- **Date:** 2026-10-27
- **Team member:** yuri
- **AI tool / model:** Claude Code (Sonnet 5.5)
- **Objective:** Test the geofence location check on a PC with Chrome DevTools, find out why it showed "weak signal", and write a reusable testing guide with coordinates for every checkpoint.

## AI Prompts Used
1. How do I run the app, and how do I test on a PC?
2. I set max accuracy to 500 and put the Sensoricum coordinates in DevTools, but it still says weak signal.
3. It worked after I set the accuracy to 10.
4. Give a list of locations to test, put it in a testing folder as a file of coordinates for each checkpoint, include the DevTools steps and accuracy 10, for future testing guides in the codebase.

## Decisions Made
- **Cause of "weak signal":** the DevTools Sensors accuracy was too high (or the backend still had the old 50 m limit). Setting the Sensors accuracy to 10 fixed it. Not reproduced by the AI: the user confirmed the fix.
- **`MAX_ACCURACY_M` goes back to 50.** Raising it only hides a wrong Sensors setting and would let poor readings unlock a quiz. The guide says to fix the Sensors accuracy instead.
- **Location screen:** it now tells apart "weak accuracy", "reading too old" and "browser found no position" (English and German), because one message for all three made the problem hard to diagnose.
- **New folder `testing/`** at the repo root (one line added to the layout in `CLAUDE.md`):
  - `location-testing-guide.md`: DevTools steps, a test table for all 8 checkpoints, overlap cases, failure cases, troubleshooting, real-phone plan (WP13).
  - `checkpoint-coordinates.json`: the same positions in machine-readable form, generated from `backend/src/db/seed.js` and the geofence function.
- **Kept in sync by a test:** `backend/tests/geofence.test.js` fails if the JSON or the guide's coordinates differ from the seed or stop behaving as written.
- **Privacy:** only public map points of the Bildungscampus are listed, never real student locations. The Sensoricum centre is the building location the user supplied.
- **Not verified:** the Playwright and database-backed backend tests were not re-run after the location screen change.
