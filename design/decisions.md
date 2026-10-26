# Design and technology decisions

| # | Decision | Why |
|---|---|---|
| D1 | Frontend: React + Vite (JSX), React Router, plain CSS with tokens | Small, fast to build, no CSS framework needed; matches the team's JavaScript-only rule. |
| D2 | Backend: Node 20 + Express 4, mysql2, zod | Same language as the frontend; zod validates every external input (CLAUDE.md). |
| D3 | Database: MySQL 8.4 in Docker Compose (host port 3307) | MySQL is not installed on the team's machines; `npm install` + `npm run dev` start it automatically. |
| D4 | Map: Leaflet with OpenStreetMap tiles darkened with a CSS filter, placeholder checkpoint coordinates | CARTO Dark Matter was planned, but its free tiles now answer with an "API KEY REQUIRED" watermark. OpenStreetMap needs no key; `VITE_MAP_TILE_URL` and `VITE_MAP_DARKEN` switch to another provider. Real coordinates are calibrated on site (WBS 4.1). |
| D5 | Visual direction: dark ink game surfaces (map, quiz, result, menu) with light paper/grey panels for reading (forms, lists, risk notes) and DHBW red as the primary action colour | Mix of the "Arcade Night Campus" tokens and the light red/grey look of the Figma export. |
| D6 | The location-based game is only "inspired" by location games: no ball motif, no Pokémon or Persona imagery | Decision by the project manager. |
| D7 | Menu and quiz UI: winner of a two-agent /arena match (candidate a002, 86 to 73.5): a plain circle trigger and a slanted, staggered "trail stones" menu; full spec in [arena/menu-and-quiz-ui-spec.md](arena/menu-and-quiz-ui-spec.md) | a002 gave a complete, implementable cascade (visibility based open/close, per-class layouts, light panels actually applied). Both candidates survived all 7 attacks by conceding and fixing them. |
| D8 | Server authority for time, location and correctness; exact points kept in hundredths, rounded up once per user | BR22, R-02. |
| D9 | Resend cooldown for OTP is 30 s (was 60 s in the first spec) | Value in the build prompt; R-33 updated. |
| D10 | City expansion is a Could item only | Out of scope for the pilot. |
