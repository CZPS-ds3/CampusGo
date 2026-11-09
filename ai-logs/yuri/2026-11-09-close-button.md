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

## Follow-up: sticky buttons and lazy leaderboard
### AI Prompts Used
2. Make the buttons sticky on screen; leaderboard shows only 10 ranks, the rest lazy loaded and scrollable.

### Decisions Made
- The X and the refresh button are now `position: fixed` (same spot, same alignment), so they stay on screen while the page scrolls.
- Ranks: the first 10 ranks show (podium plus 7 rows); the other rows sit in a scrollable box and are added 10 at a time when its end comes into view (IntersectionObserver, "Show more" button where it is missing). The reveal is client-side: the API already returns up to 100 entries, so the backend is unchanged. The "your rank" card now looks only at the rows that are shown, so it still appears when the player is further down.
- Tests: `frontend/tests/ranks-lazy.test.jsx` (10 shown, +10 per scroll, no box for 10 or fewer) and a sticky test in `close-button.spec.js`.

## Follow-up: "Go to team" below "Team ranks locked"
### AI Prompts Used
3. Move "Go to team" to the bottom, right below "Team ranks locked", aligned to the left, same edge.

### Decisions Made
- On the solo ranking (player without a team) the chip and the link were side by side; they are now stacked, link below the chip, both on the left edge (`.ranks__locked`). Text and link target unchanged.
- The "Team" tab's empty state (with its own button) was not touched.
- New Playwright test `frontend/e2e/ranks-locked.spec.js` checks the stacking and the shared left edge on all six screen sizes.

## Follow-up: align "Go to team" with the lock icon
### AI Prompts Used
4. The link needs to move slightly right: use the "G" as the alignment point, below the lock icon.

### Decisions Made
- The link now starts 11 px in (chip border 1 px + padding 10 px), so the "G" of "Go to team" sits right below the lock icon. The browser test compares the link with the lock icon's position (within 2 px) on all six screen sizes.
