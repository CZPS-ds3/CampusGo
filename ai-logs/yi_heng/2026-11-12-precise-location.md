# AI Log — Precise location

- **Date:** 2026-11-12
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code, Opus
- **Objective:** Make the location check and the live map as precise as possible, then run all tests and add
  regression tests.

## AI Prompts Used
1. "can you improve the location to be as precise as possible and everything? ... also run all the test and also
   regression test to make sure that everything is working"

## Decisions Made
- The location check now averages the phone's precise readings over a few seconds (weighted by accuracy; cached
  readings and outliers are left out) instead of sending the single best one. The accuracy sent stays that of the
  best single reading, so the server is never told more than was measured. The screen shows "Accuracy so far: ±N m".
- Distances are measured on the WGS84 ellipsoid (Vincenty) on the server, the map and the mock API; the old sphere
  was 0.3 % short east-west. R-60 in `docs/business-rules.md` named Haversine, so its wording was updated: this
  needs the team's approval.
- The live map no longer counts a repeated or older GPS fix again.
- Kept unchanged on purpose: the BR12 limits (200 m accuracy, 30 m grace zone, 50 m credit), the radii and the
  centres. Real precision of the centres needs the on-site test (WP13); the team's photos carry no GPS data.
- The GPS window was kept at 8 s (a longer one made the "weak signal" answer slower for nothing). The browser
  test for it now waits as long as the other location checks, and a race in the browser-test helper `open()` (the
  login redirect sometimes replaced the page under test) was fixed.
- The carousel browser test still used the Mensa gallery, which became one team photo in the question-bank task;
  it now uses the Library (9 photos) and starts its 5 s timer at a known moment (it could move on twice on a busy
  machine).
- Six regression tests and new unit tests (WGS84 reference distances, averaging, outliers). Nothing was committed
  by the AI.
