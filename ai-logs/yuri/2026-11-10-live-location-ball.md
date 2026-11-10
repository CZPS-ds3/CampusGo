# AI Log — Live location ball and Re-center redesign

- **Date:** 2026-11-10
- **Team member:** Yuri
- **AI tool / model:** Claude Code, Claude Opus 5.5
- **Objective:** Redesign the live-location marker and the Re-center button so they no longer look like Google Maps and fit the app's DHBW look, and fix the map tint on the flat street map.

## AI Prompts Used
1. Redesign the Re-center button and the live location marker: related to the app/DHBW colours, distinct from Google Maps, button and marker similar but different.
2. Light and dark mode for both; rename "Re-centre" to "Re-center"; gyroscope/compass support on PC and mobile for the direction.
3. Map personalisation (tint) must work on the flat street map too, not only in 3D; never on the aerial photo.
4. Accuracy radius in a much lighter red; Re-center zooms closer (2.2x, later 1.2x more; closest zoom on phones) and shows the ball low-middle on the screen; Re-center button level with the centre GO button.
5. Many iterations on the marker: liquid orb, red 3D ball, floating ball with arrow, then a low-poly (geodesic) ball after a reference image; finally white with thin red lines and outline, 42 px on every device, fixed size at every zoom, no glow/shadow/float/pulse.
6. The ball glides between GPS readings and rolls in the walking direction, in 2D and 3D; it stays upright when the 3D map is turned.
7. Replace the accuracy circle with slow sonar waves that roll out to the accuracy radius; widen the direction wedge on the ground (finally 128 degrees).
8. Make the ball and waves shrink with the zoom when zooming out, to prompt users to tap Re-center.
9. Make the shown position as exact as Google Maps; merge preproduction into the branch and fix conflicts.

## Decisions Made
- Accepted: the slate/red DHBW look for Re-center (white on a light map, light grey on a dark map, red square while following) and the lowercase "Re-center" label (German stays "Zentrieren").
- Accepted: the flat-map tint bug fix (Leaflet writes an inline `opacity: 1` on tile layers, so the tint rule needs `!important`), with a Playwright regression test in `frontend/e2e/map-3d.spec.js` instead of `tests/regression/test_regression.py`, because that suite only tests the API (to confirm with the team).
- Accepted: gyroscope-only devices turn the direction wedge relative to the walking direction; screen rotation is corrected; iOS asks for the compass on a Re-center tap.
- Changed: the direction arrow above the ball was removed at Yuri's request; the direction is now a wedge on the ground so the compass/gyroscope still shows.
- Rejected/removed along the way: liquid orb, glow, float, ground shadow, pulsing and shining facets, and the network lines from the reference image (clutter at marker size).
- The accuracy circle and the 3D map's accuracy layer were replaced by markers, so they glide with the ball and keep a fixed screen size; a coarse fix is capped at 80 px.
- Location accuracy: a web app gets the same Geolocation readings as Google Maps in the browser, so it cannot beat the device (a laptop without GPS stays Wi-Fi/IP based). Accepted: always a fresh fix (`maximumAge: 0`) and ignoring a much coarser reading right after a precise one unless it shows a real move.
- Not verified on a real phone or Windows tablet: gyroscope and screen-rotation handling are covered by unit tests only.
