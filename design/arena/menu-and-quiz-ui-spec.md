# Campus & City Quest: Menu and Quiz Screen, UI Specification

> **Status (2026-10-27):** the look in this document (slanted trail menu, arcade colours) was replaced by the campusGO prototype, see [decisions.md](decisions.md) D5. The behaviour rules (focus trap, inert page, keyboard, timer, states, responsive classes) are still valid.

## 0. Assumptions
- Menu, quiz card, hard-offer sheet and the expired/error layers are dark game surfaces. The quiz score panel, the phone score strip and the hard-offer risk note are light DHBW panels (reading content).
- The server returns `{ deadlineAt, serverNow }` on every attempt response. The client stores `offset = serverNow - Date.now()` and uses it only to draw. Expiry and correctness are decided by the server.
- "Big checkpoint" is one of the 4 large ones; the server sends `hardOfferAvailable`.
- Contrast (computed): ink text on red `#FF2E4D` about 5.2:1; white on DHBW red `#E2001A` about 5.0:1; ink on orange `#FF8A00` about 8.1:1; cyan on ink about 11:1; `#292A2D` on `#F2F3F4` about 13:1. Red `#FF2E4D` is only ever a fill with ink text or large display text.

## 1. Shared tokens
```css
:root{
  --ink:#0B0E1F; --ink-2:#151A38; --ink-3:#232A55;
  --red:#FF2E4D; --dhbw-red:#E2001A; --volt:#FFD60A; --cyan:#19E3FF; --mint:#2BFFA6;
  --paper:#F4F1E8; --muted:#9AA3D6; --warn:#FF8A00;
  --grey-1:#F2F3F4; --grey-2:#DFE1E4; --text-1:#292A2D; --text-2:#2F3033;   /* DHBW light */
  --r-1:12px; --r-2:16px; --r-3:24px;
  --hard:4px 4px 0 #000; --skew:-6deg; --skew-inv:6deg;
  --ease-pop:cubic-bezier(.2,.9,.25,1.25); --ease-out:cubic-bezier(.2,.8,.2,1);
  --z-banner:45; --z-scrim:40; --z-menu:50; --z-trigger:60; --z-sheet:70; --z-toast:80; --z-expired:90;
  --safe-b:env(safe-area-inset-bottom,0px);
  --trigger:64px;
  --menu-clearance:calc(var(--trigger) + 32px + var(--safe-b));   /* 96px + inset */
}
.page{padding-bottom:var(--menu-clearance)}   /* every page that shows the menu */
```
Fonts: Anton (skewed uppercase headings), Rubik (body), JetBrains Mono (timer, points, tile numbers). Spacing scale 4/8/12/16/20/24/32/48.

## 2. Menu

### 2.1 Visual twist (one sentence)
**The tiles climb out of the circle as a zig-zag footpath of numbered "trail stones" (01-05, mono) joined by a dashed cyan path that draws itself between them, and the current page is a volt-yellow punched "you are here" ticket, so it reads as a campus trail map, not a tab bar, a star-burst or a ball.**
The trigger is a plain solid circle: no ball motif, no red/black split, no star-burst.

### 2.2 Components
```
<MenuRoot items currentPath>        // portal outside #app-root; null on splash, login, sign-up, quiz
  <MenuScrim open onClose/>
  <MenuPanel id open activeId>      // ul role=menu
    <MenuTile index label icon href active/>   // x5, inside li role=none
  <MenuTrigger open onToggle/>
```
Props: `items:{id:'map'|'quests'|'team'|'ranks'|'profile',label,href,icon}[]`, `currentPath`. State: `open`, `focusIndex`. A route flag unmounts the component on splash, login, sign-up and quiz, so no hidden focusable element remains there.

### 2.3 DOM and ARIA
```html
<nav class="menu" aria-label="Main">           <!-- .is-open toggled by React -->
  <div class="menu__scrim"></div>
  <ul id="menu-panel" class="menu__panel" role="menu" aria-label="Main menu">
    <li role="none" style="--i:0"><a role="menuitem" class="tile" href="/map" tabindex="-1" aria-current="page">
      <span class="tile__n" aria-hidden="true">01</span><svg class="tile__ico" aria-hidden="true"/>
      <span class="tile__label">Map</span><span class="tile__here">HERE</span></a></li>
    <!-- Quests 02, Team 03, Ranks 04, Profile 05 -->
  </ul>
  <button class="menu__trigger" aria-haspopup="menu" aria-expanded="false"
          aria-controls="menu-panel" aria-label="Menu"><svg aria-hidden="true"/></button>
</nav>
```
There is no `hidden` attribute on the panel (see 2.4). The active item has `aria-current="page"`, the yellow fill, the punched hole and the "HERE" tag, so it is not marked by colour alone.

### 2.4 CSS (base: phone portrait, tablet, column)
```css
.menu__trigger{position:fixed;left:50%;bottom:calc(16px + var(--safe-b));translate:-50% 0;
  width:var(--trigger);height:var(--trigger);border-radius:50%;border:0;
  background:var(--dhbw-red);color:#fff;box-shadow:var(--hard);z-index:var(--z-trigger);
  transition:transform .18s var(--ease-pop),box-shadow .18s}
.menu__trigger:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #000}
.menu__trigger:focus-visible,.tile:focus-visible{outline:3px solid var(--cyan);outline-offset:3px}

/* Closed: laid out but invisible, untappable and out of the a11y tree. No display:none, so the
   transitions have a start state. visibility flips after the close cascade has finished. */
.menu__panel,.menu__scrim{visibility:hidden;pointer-events:none;
  transition:visibility 0s linear .3s}
.menu.is-open .menu__panel,.menu.is-open .menu__scrim{visibility:visible;pointer-events:auto;
  transition-delay:0s}
.menu__panel{position:fixed;left:50%;translate:-50% 0;
  bottom:calc(16px + var(--trigger) + 16px + var(--safe-b));
  width:min(288px,calc(100vw - 32px));display:flex;flex-direction:column-reverse;gap:8px;
  list-style:none;margin:0;padding:0;z-index:var(--z-menu)}
.menu__scrim{position:fixed;inset:0;background:rgba(11,14,31,.72);opacity:0;z-index:var(--z-scrim);
  transition:opacity .16s var(--ease-out),visibility 0s linear .3s}
.menu.is-open .menu__scrim{opacity:1}

.menu__panel li{position:relative;filter:none;--dx:0px;--dy:0px}
li:nth-child(odd){--dx:-14px} li:nth-child(even){--dx:14px}          /* zig-zag */
.tile{position:relative;display:flex;align-items:center;gap:12px;min-height:56px;padding:0 16px;
  background:var(--ink-2);color:var(--paper);border-radius:var(--r-1);box-shadow:var(--hard);
  text-decoration:none;opacity:0;
  transform:translate(0,48px) skewX(var(--skew)) scale(.7);
  transition:transform .14s var(--ease-out) calc((4 - var(--i))*25ms),opacity .14s calc((4 - var(--i))*25ms)}
.menu.is-open .tile{opacity:1;transform:translate(var(--dx),var(--dy)) skewX(var(--skew)) scale(1);
  transition:transform .28s var(--ease-pop) calc(var(--i)*55ms),opacity .28s calc(var(--i)*55ms)}
.tile > *{transform:skewX(var(--skew-inv))}
.tile__n{font:700 14px/1 'JetBrains Mono';color:var(--cyan)}
.tile__label{font:400 22px/1 Anton;text-transform:uppercase;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tile__here{display:none;margin-left:auto;font:700 11px 'JetBrains Mono'}
/* Active ticket: no clip-path, so the ring, shadow and connector are never cut off.
   The "punch" is an inset circle in the ground colour plus a dashed perforation. */
.tile[aria-current]{background:var(--volt);color:var(--ink)}
.tile[aria-current] .tile__n{color:var(--ink)}
.tile[aria-current] .tile__here{display:block}
.tile[aria-current]::after{content:"";position:absolute;right:56px;top:50%;width:12px;height:12px;
  margin-top:-6px;border-radius:50%;background:var(--ink);box-shadow:-6px 0 0 -5px var(--ink)}
.tile[aria-current]::before{content:"";position:absolute;right:62px;top:6px;bottom:6px;
  border-left:2px dashed var(--ink);opacity:.4}
/* Connector between stones: lives on the li, outside the tile */
.menu__panel li + li::before{content:"";position:absolute;left:50%;bottom:100%;height:8px;
  border-left:2px dashed var(--cyan);transform:scaleY(0);transform-origin:bottom;
  transition:transform .12s var(--ease-out)}
.menu.is-open li + li::before{transform:scaleY(1);transition-delay:calc(var(--i)*55ms + 120ms)}
```
The focus ring is an outline 3px wide and 3px away from the tile, so on the yellow tile it lies over the dark scrim (cyan on ink about 11:1), not over the yellow fill. Panel height in the column: 5 x 56 + 4 x 8 = 312px (320px tall tiles at 64px give 352px).

### 2.5 Animation sequence
Open, about 520 ms in total:
1. t=0: the panel and scrim become `visibility:visible` immediately (no delay); scrim fades in 160 ms; the trigger icon turns from bars to X in 200 ms.
2. Tile `i` (0 = Map, nearest the thumb) starts at `i x 55 ms` and goes from `translate(0,48px) skewX(-6deg) scale(.7)`, opacity 0, to `translate(var(--dx),var(--dy)) skewX(-6deg) scale(1)`, opacity 1, in 280 ms, `--ease-pop` (slight overshoot).
3. The dashed 2px cyan connector between tile `i-1` and `i` draws with `scaleY(0 to 1)` in 120 ms at `i x 55 + 120 ms`.
4. The last tile lands at about 500 ms; the ticket stamps once (scale 1.06 to 1, 120 ms).
5. After 300 ms the script sets focus on the active tile (Map when none).

Close, about 260 ms: top tile first, 25 ms stagger, 140 ms, `--ease-out`; connectors vanish at once; `visibility` flips to hidden after 300 ms through the delayed transition, then focus returns to the trigger. Press feedback: a tile moves 2px down-right and loses its shadow while pressed.

### 2.6 Keyboard, touch, mouse
- Trigger: Enter, Space or click toggles; ArrowUp on the trigger opens with the last tile focused.
- Roving tabindex: the focused tile has `tabindex=0`, the others `-1`. ArrowUp/ArrowDown/ArrowLeft/ArrowRight move and wrap; Home/End jump; first-letter jump (M, Q, T, R, P); Enter or Space activates.
- **Focus trap (exactly):** while open, the menu is rendered in a portal and `#app-root` gets `inert` (page content, sticky headers and toasts cannot take focus or taps). A keydown handler on the root handles Tab: from the current tile it moves to the trigger, from the trigger back to the current tile (Shift+Tab reverses). That is 2 Tab stops by design; arrows are the way to move among the five tiles.
- Escape, a click on the scrim or choosing a tile closes the menu. Focus returns to the trigger; after a navigation it goes to the new page `<h1>`.
- Touch and mouse: tiles are 56px high (64px on tablet) with 8px gaps, no hover-only behaviour (hover adds a 2px lift).

### 2.7 Reduced motion
```css
@media (prefers-reduced-motion:reduce){
  .tile,.menu__scrim,.menu__panel,.menu__trigger,.menu__panel li::before{transition:none!important;animation:none!important}
  .menu.is-open .tile{opacity:1;transform:translate(var(--dx),var(--dy)) skewX(var(--skew))}
  .menu.is-open li + li::before{transform:scaleY(1)}
}
```
The menu appears and disappears instantly (visibility flips at once), keeps the same layout and static skew, connectors are fully drawn, and the icon swaps without rotation.

### 2.8 Responsive (the trigger is always fixed at bottom-centre of the viewport)
| Class | Trigger | Menu layout |
|---|---|---|
| Phone 360-430px portrait (base) | 64px circle, 16px above the bottom plus safe inset | One column, width `min(288px, 100vw - 32px)`, cascade upward, zig-zag of 14px |
| Phone landscape: `(orientation:landscape) and (max-height:480px) and (max-width:932px)` | same | 3 + 2 grid, width `min(520px, 100vw - 32px)`, 120px high |
| Tablet 768-1024px, portrait and landscape (height above 480px) | same | Same column as phone, width 320px, tiles 64px, panel height 352px; with the trigger zone it needs 352 + 96 = 448px, which fits |
| Laptop `(min-width:1280px)` | same, bottom-centre | One row of 5 tiles, 168px each, 8px gap, width 872px, a rising trail |

```css
@media (orientation:landscape) and (max-height:480px) and (max-width:932px){
  .menu__panel{display:grid;width:min(520px,calc(100vw - 32px));gap:8px;
    grid-template-columns:repeat(3,1fr);
    grid-template-areas:"ranks profile ." "map quests team"}   /* bottom row nearest the thumb */
  .menu__panel li:nth-child(1){grid-area:map}   li:nth-child(2){grid-area:quests}
  .menu__panel li:nth-child(3){grid-area:team}  li:nth-child(4){grid-area:ranks}
  .menu__panel li:nth-child(5){grid-area:profile}
  .menu__panel li{--dx:0px}  .menu__panel li + li::before{display:none}
}
@media (min-width:768px){.menu__panel{width:320px}.tile{min-height:64px}}
@media (min-width:1280px){
  .menu__panel{display:grid;width:872px;grid-template-columns:repeat(5,168px);grid-template-areas:none;gap:8px}
  .menu__panel li{--dx:0px;grid-area:auto}
  .menu__panel li:nth-child(n){--dy:calc(var(--i)*-12px)}        /* each tile 12px higher: rising trail */
  .menu__panel li + li::before{display:none}                    /* the rise replaces the dashed path */
}
```
In the grid classes the stagger order is the same (`--i` 0-4 = Map first); the connector is hidden because the geometry is no longer vertical. Order for the landscape grid: Map, Quests, Team along the bottom row (cascade left to right), then Ranks and Profile on the top row. The laptop media query comes last and uses `min-width`, so a short laptop window (the row is only 104px high) never gets the landscape grid, which is capped at 932px wide. There is no side rail: one position keeps muscle memory and meets "fixed bottom-centre". Pages use `padding-bottom: var(--menu-clearance)`; from 1280px the content adds another 24px. Tiles are never clipped: widths use `min()` and labels truncate with an ellipsis.

## 3. Quiz screen

### 3.1 Components
```
<QuizScreen attemptId>
  <QuizHeader checkpointName index total deadlineAt serverOffset>
    <CheckpointTitle/> <QuestionCounter/> <Countdown/> <TimeBar/>
  <QuizCard>
    <QuestionText/> <OptionList> <OptionButton letter text state/> x4
    <FeedbackBanner/> <NextButton/>
  <QuizSidePanel points attemptNo multiplier dots/>     // aside, light panel
  <HardOfferSheet onChoose/>  <StatusLayer state="loading|expired|offline|error"/>
```
`OptionButton.state`: `idle | submitting | correct | wrong | revealed | disabled`.

### 3.2 Header
- Checkpoint name: Anton 20px (24px from 768px), uppercase, `skewX(-6deg)`, `min-width:0`, one line with an ellipsis; below 400px it clamps to 2 lines (`-webkit-line-clamp:2`) so "Care.box and Shop.box" is not cut mid-word. The full name is in `title` and in a visually hidden `<h1>`.
- Counter: mono chip "3 / 5", 14px, `aria-label="Question 3 of 5"`.
- Countdown: `m:ss`, JetBrains Mono 28px, volt on an `--ink-2` pill with a clock icon, `tabular-nums`. `role="timer"` with `aria-live="off"`; a hidden live region announces only "30 seconds left", "10 seconds left", "Time is up".
- Value: `remaining = deadlineAt - (Date.now() + offset)`, redrawn every 250 ms, shown as `ceil(remaining/1000)`, clamped at 0:00. One deadline per attempt: total 60 s x questions (3:00 or 5:00 at the start). At 0:00 the client shows "Checking..." until the server confirms.
- `TimeBar`: 8px track in `--ink-3`, fill with `transform:scaleX(remaining/total)`.
- **Urgent state (last 30 s, not by colour alone):** fill and pill turn orange (ink text, about 8.1:1); the bar fill gets a flat diagonal hatch (not a gradient wash); the clock icon becomes an alarm icon that shakes 2px for 600 ms; a "HURRY" mono tag appears; the pill's hard shadow pulses. Reduced motion removes shake and pulse but keeps hatch, icon and tag.

### 3.3 Question and options
```css
.opt{display:grid;grid-template-columns:40px 1fr;align-items:center;gap:12px;width:100%;
  min-height:56px;padding:12px 16px;text-align:left;background:var(--ink-2);color:var(--paper);
  border:2px solid var(--ink-3);border-radius:var(--r-2);box-shadow:var(--hard);font:400 17px/1.35 Rubik}
.opt__key{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;
  background:var(--ink-3);font:700 18px 'JetBrains Mono'}
.opt[aria-disabled=true]{pointer-events:none}
```
- Question text: Rubik 500, 20px/1.4 on phone, 22px on tablet, 24px on laptop, `overflow-wrap:anywhere`. Options A-D stacked, 12px gap, whole row is the button.
- **Submit on tap:** the handler sets `inFlight.current` and `aria-disabled` on all four options synchronously, so a double tap or Enter plus click sends one request, which also carries `Idempotency-Key: attemptId:questionId`. The chosen option shows a spinner and a dashed border while the server judges.
- **Correct:** the option fills mint with ink text and a check icon; the banner "Correct! +1,000" (mono) stays until the player moves on. The banner sits in `role="status"` (polite), so a screen reader reads it fully. The "Next" button takes focus and shows a 1,800 ms shrinking bar; the quiz advances by itself after 1,800 ms, but the countdown stops while Next has focus or the pointer is over it. Under reduced motion there is no auto-advance, and none before the hard-offer sheet (see 3.4): the player always presses Next. The attempt clock keeps running throughout.
- **Wrong:** the pick gets a red outline, a cross icon and the tag "Your answer"; the right option is revealed in mint with a check and the tag "Right answer"; the others dim to 60%. A primary "Next" (`--dhbw-red`, white text, 56px, full width on phone) takes focus. No retry. On the last question it reads "See result".
- Correct and wrong always combine icon, text and colour.

### 3.4 Hard-question offer
Shown after questions 1-4 are all correct on the first attempt of a big checkpoint, when the player presses Next on question 4. It is a bottom sheet (`--ink-2`, `--r-3` top radius, hard shadow, `role="dialog" aria-modal="true"`, z-index 70, not dismissible by the scrim, `#app-root` inert). Focus moves to the title and the normal card is the first stop. Title: "Question 5: choose your path". Two different cards (not an identical grid):
1. **Normal question 5:** "1,000 points". Outlined secondary card; choosing it loads normal question 5 directly.
2. **Hard question:** a large volt mono "2,000", a "HARD" tag, primary style. Tapping it opens an inline confirm in the card: "Go hard" (red) and "Back", because the choice cannot be undone.

Risk note, a light `--grey-1` panel with `--text-1` text and an orange warning icon, always visible: "You already have 4 of 5 right, so you have passed. A hard question is worth 2,000 instead of 1,000. If you get it wrong you lose the 1,000 for question 5 and the 200 full-clear bonus. You cannot switch back, and the clock keeps running." The choice calls `POST /attempts/:id/question-5 {variant}` (idempotent); both cards are disabled while it runs. If the attempt deadline passes while the sheet is open, the sheet unmounts and the expired layer (z-index 90) takes focus.

### 3.5 States
| State | Presentation |
|---|---|
| Loading | `--ink-3` skeleton blocks with a hatch (no shimmer under reduced motion), "Loading your question...", `aria-busy="true"` |
| Submitting | Spinner on the chosen option, a "Saving..." chip, the timer keeps running |
| Expired | Layer at z-index 90 over the card and any sheet: "Time is up", mono 0:00, options disabled, unanswered questions marked; one button "See result" (final, no retry); focus on it |
| Offline | Sticky orange banner (z-index 45) with a wifi-off icon: "You are offline. The server clock keeps running." Options disabled. A pick made just before the drop is retried once on `online` if the deadline has not passed |
| Error | Inline card with message and "Try again" (same idempotent request); after 3 failures also "Back to map" |

### 3.6 Responsive
| Width | Layout |
|---|---|
| Phone under 768px | Single column, 16px gutters, sticky header. Card full width, `--r-3` corners. The side column becomes a one-line light strip under the header (`--grey-1`, `--text-1`): "Points 2,350 / Attempt 1 / 100%" plus dots |
| Tablet 768-1023px | Container `max-width:720px`, grid `1fr 200px`, 24px gap, card padding 24px, sticky aside |
| Laptop 1024px and up | `max-width:960px`, grid `minmax(0,1fr) 280px`; from 1280px `max-width:1040px`, aside 320px, card padding 32px |

```css
.quiz{display:grid;gap:16px;padding:16px 16px calc(16px + var(--safe-b))}
@media (min-width:768px){.quiz{max-width:720px;margin:0 auto;grid-template-columns:1fr 200px;gap:24px;padding:24px}}
@media (min-width:1024px){.quiz{max-width:960px;grid-template-columns:minmax(0,1fr) 280px}}
@media (min-width:1280px){.quiz{max-width:1040px;grid-template-columns:minmax(0,1fr) 320px}}
.quiz__side{background:var(--grey-1);color:var(--text-1);border:1px solid var(--grey-2);
  border-radius:var(--r-2);box-shadow:var(--hard)}
```
The aside holds question dots (done, current, pending, distinguished by shape and number), points so far, the attempt multiplier and "Time bonus 1 per second". The menu is not mounted, so bottom padding is only the safe inset.

## 4. Dark and light mix
Dark ink ground for the game surfaces: menu (`--ink` scrim, `--ink-2` tiles), quiz card, options, hard-offer sheet, expired layer. Light DHBW panels for reading: the quiz score panel and phone strip (`--grey-1`, `--grey-2` border, `--text-1`), and the hard-offer risk note. DHBW red is the primary action colour (trigger, Next, "Go hard"). Yellow marks points, timer and the active ticket; mint and cyan mark success and info. No gradient washes, no emoji, inline SVG only.

## 5. Edge cases handled
- Long names: ellipsis or 2-line clamp with full name in `title`; long questions wrap with `overflow-wrap:anywhere`.
- Small phones (320-360px): option text 16px, tile labels 20px, gutters 12px.
- Landscape phones: the 3 + 2 grid; the quiz scrolls with only the header sticky.
- 200% zoom: falls into the phone class, no fixed heights, sticky header keeps the timer visible, sizes in `rem`.
- The menu cannot cover the quiz because it is not mounted there. The quiz back path is a confirm dialog; the attempt keeps running on the server.
- Refresh or reconnect: question set and state come from the server; the countdown is rederived from `deadlineAt`.
- Notches and home indicators: `env(safe-area-inset-bottom)` on trigger, quiz bottom and sheet.
- Closed menu never catches taps or focus (visibility hidden); open menu inerts the page.
- RTL: not required.

## 6. Requirements checklist
Menu: five destinations, hidden in quiz and login (2.2); plain circular trigger bottom-centre with safe area (2.4); slanted staggered cascade (2.4, 2.5); twist (2.1); Escape, focus trap, arrows, focus return, `aria-expanded`, `role=menu` (2.3, 2.6); reduced motion (2.7); per-class layout and page padding (1, 2.8).
Quiz: header with long names, counter, `m:ss` server countdown, urgent state not by colour alone (3.2); options A-D, instant submit, reveal, Next, success state, no double submit (3.3); hard offer and risk (3.4); five states (3.5); responsive with breakpoints (3.6).
