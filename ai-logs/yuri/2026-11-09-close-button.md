# AI Log — X (close) button on every page except the map

- **Date:** 2026-11-09
- **Team member:** yuri
- **AI tool / model:** Claude Code, Sonnet 5.5
- **Objective:** Add an X button in the top right of every page except the map, styled like the refresh-leaderboard button, always in the same place, closing to the map. Move the refresh button to the left of the X. Align both with the middle of the page title (Ranks, Team, Quests). Responsive on mobile, no other functionality changed.

## AI Prompts Used
1. Add the X button (style of the refresh button, same position everywhere, not on the map, closes to the map), refresh button to its left, buttons level with the middle of the title text, mobile responsive, no other changes.

## Decisions Made
- One shared `PageClose` component rendered once for everything behind the login, so the position cannot differ per page. It is placed from the top right of the window (20 px on phones, 32 px from 768 px, same as the page padding).
- Vertical position is computed from the title line (page top padding + half of the H1 line), so the middle of the buttons is level with the middle of the title text.
- Not shown on the quiz page: it keeps its own header and its back button is deliberately disabled while an attempt runs, so leaving mid-attempt is not offered. Not shown on the map, login and splash.
- The refresh button's `aside` slot now sits to the left of the X, 8 px apart. Page headers got right padding so long titles stay clear of the buttons.
- New Playwright test `frontend/e2e/close-button.spec.js` (all six screen sizes): same position on every page, not on the map, closes to the map, level with the title, refresh left of the X, admin pages too.
- Checked by screenshots (phone 360 and laptop 1280) that nothing is covered on Ranks, Profile, Team, Info and Location check. All 252 browser tests and `npm run check` pass.
