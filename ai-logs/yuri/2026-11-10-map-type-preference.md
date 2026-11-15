# AI Log — Map type preference

- **Date:** 2026-11-10
- **Team member:** Yuri
- **AI tool / model:** Claude Code, Opus 5.5
- **Objective:** Let students choose in the preferences which map (aerial photo or street map) opens first, and make clear that the map style settings only change the street map.

## AI Prompts Used
1. "In the map personalisation, explicitly specify that the personalisations are for the street map version, such as Map style (Street map). Also add a function to the preferences section to set the default type of map shown: aerial photo and street view as small rectangles side by side, with a selection panel below in the style of Follow the app / Light / Dark. It should be below font size, above language."
2. "No, remove the (Street map) from the Map style."
3. "OK nice, now commit" / "Give merge request title" / "Help me do the AI log."

## Decisions Made
- Added a "Default map" picker (`frontend/src/components/MapTypePicker.jsx`) between Font size and Language. It shows two live previews of the campus (aerial photo and street tile) side by side, with an Aerial photo / Street map switch below in the same segmented style.
- The choice is saved on the device like font size and language, not on the account. The map starts with it, and the switch on the map still works.
- First renamed the card to "Map style (Street map)", then reverted to "Map style" at my request. Kept a short note instead: light, dark and the tint change only the street map.
- Changed the tint so it applies only to the street map tiles; before, it also faded the aerial photo.
- Added 3 tests (`frontend/tests/map-type-picker.test.jsx`). `npm run check` passed. Checked the picker and the street-map start in a phone-sized browser screenshot.
- Committed as `84c8a17 feat: add default map type preference`.
- Merge request title: "FEATURE: Aerial photo map background and default map type preference". The description names BR48 and the change to decision D4.
