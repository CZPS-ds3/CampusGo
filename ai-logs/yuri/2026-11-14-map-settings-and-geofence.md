# AI Log — Map, settings, geofence and demo players

- **Date:** 2026-11-14
- **Team member:** Yuri
- **AI tool / model:** Claude Code, Opus 5.5
- **Objective:** Rework the map and the profile settings: one turnable map for 2D and 3D, a calmer sonar ring that shows the real (tightened) unlock range, a cleaner Customisation card, a reliable Re-center button, a night look for the aerial photo, faster map loading, the DHBW font, and a switch that hides the demo players.

## AI Prompts Used
1. "Explain how the sonar range ring works" and "so it shows the range I can interact with checkpoints?"
2. A long list of map and settings changes: soft pulse by default, slower speeds, no inner red waves, "Open to edit", Customisation title, map theme carousel, Advanced colour groups with a double-click popup, sonar settings in Preferences, language above font size, street map on the left, a turnable 2D map that is the 3D map without buildings, "2D"/"3D" buttons, dark-mode map buttons, and "re-evaluate the 60-80 m radius" (Mensa could reach Care.box and Shop.box).
3. Follow-ups: remove descriptions and the "hard to see" warning, element-specific popup previews of one size, centred popup on phones, street map and 3D as defaults for new accounts with a device check, a live street-map preview, "tap" instead of "click", "Tap to expand", "Direction indicator", direction wedge always visible, the ring "still way too huge".
4. Sonar speeds changed several times; final: both looks at fast 3 s, normal 4.5 s (default), slow 6.75 s, one wave at a time.
5. "Re-center sometimes doesn't press / only moves the map a little, make it ALWAYS work."
6. "Find a nighttime version of the aerial photo" (by German time), faster map loading, the aerial-photo note in the preferences.
7. "Change the whole app to the DHBW font (dhbw.de)", also for the checkpoint names on the map; add the font files to the shared repository.
8. "Hide all seeded player data in ranks/teams; add an admin option next to the mock inbox to show it."
9. "AI log, commit, give MR title."

## Decisions Made
- BR12 (needs the team's approval): radii 35 m (buildings), 30 m (garden), 25 m (small spots), grace zone 10 m, accuracy credit 15 m (was 60-80 m, 30 m, 50 m). The AI asked first and I chose "Tight". Migration 014 shrinks every pilot circle that is larger. My dev database had 60 m circles and a 200 m Building C from earlier testing, which is why the ring still looked huge.
- 2D is now the MapLibre map, flat and turnable. Leaflet stays only as the fallback without WebGL.
- "Follow the app" follows the app's dark mode switch, not the browser, so it was not renamed to "Follow browser".
- There is no open night aerial photo of Heilbronn. At night the day photo is darkened, by the sun position over the campus.
- Re-center: the AI found and fixed four causes, with a browser test that reproduces the "moves only a little" bug: the flight was cut short by follow pans, the GO ball covered it, double-tap zoom swallowed taps, and taps during a style update never flew.
- Font: Generis Sans, the DHBW web font (Monotype). The AI pointed out the licence belongs to DHBW. I decided to add the files to the repository for the testing phase while I get permission (decision D54).
- BR56 (needs the team's approval): demo players are marked `students.is_demo` (migration 015) and hidden by default. The "Show demo players" admin switch shows them again. The mock API starts with them shown.
- Tests were added for every change, and regression tests for the Re-center and Mensa/Care.box bugs. Lint, format, all unit tests (backend 339, frontend 245), the Python suites and the build pass.
- The full browser run on the final code passed 408 of 426. The 18 failures were three map tests that still assumed new accounts start on the aerial photo, plus one measurement taken while the map was still following. All were fixed and rerun on all six screen sizes. A rare missed drag under load was also fixed: every drag step now stops following, not only the drag start.
