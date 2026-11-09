# AI Log — Map aerial layer

- **Date:** 2026-11-09
- **Team member:** Yuri
- **AI tool / model:** Claude Code, Sonnet 5.5 and Opus 5.5
- **Objective:** Find a free, up-to-date alternative to the Leaflet + OpenStreetMap map, because the Sensoricum is shown as the old car park, and switch the app's map to it.

## AI Prompts Used
1. "If I want to use Google Maps, which one should I research?" / "I just need the map to replace the current OpenStreetMap one" / "Is it free?"
2. "I need a free alternative to the current maps ... at least Google Maps level, as things like Sensoricum is not correctly shown ... Do deep research on free open source alternatives, if paid, at least 50000 calls."
3. Shared a screenshot of the OpenStreetMap iD editor showing the Sensoricum area: "OSM already has Sensoricum, can you make it so that this version of the map appears instead?"
4. "Yes please" (write this AI log).

## Decisions Made
- Rejected the Google Maps API: it is out of scope (business rules, BR51), needs a credit card and has a billing risk.
- Research result: OpenStreetMap data has no Sensoricum yet (the spot is mapped as a car park), so switching to another OSM-based tile provider would not fix it. The research report file was not saved; the findings are only in the chat.
- The screenshot showed the LGL Baden-Wuerttemberg aerial photo (DOP20, flown May 2026), which is used as the editor background. It is free open data (dl-de/by-2-0, no key). Accepted it as the default map background.
- Added `frontend/src/map-layers.js`, used by the main map and the admin geofence editor. It shows the aerial photo by default and has a switch to the street map, because the photo has no street names. `VITE_MAP_BASE=street` starts with the street map instead.
- The dark-mode filter now applies only to the street map, so the photo is not inverted.
- Verified with `npm run check` (all tests pass) and a headless browser screenshot of the aerial layer. Not yet tested in the full app or on a phone.
- Open points:
  - Team approval, because this changes decision D4 in `design/decisions.md`.
  - Check on site whether the Sensoricum is a new building or the container block.
  - Optionally add the building to OpenStreetMap.
