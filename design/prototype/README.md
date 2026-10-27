# Figma Make prototype (reference only)

This folder keeps the sources of the first "campusGO" prototype that was exported from Figma Make: `src/App.tsx` (16 screens in one file), `src/index.css`, `src/main.tsx`, `index.html` and the favicon. It is **not** built, linted or run by the project and it is not the shipped design.

What was taken over: the flow (welcome, sign-up, location permission, checkpoint detail, verify, quiz, feedback, completion, leaderboard, profile, expired and wrong-place states) and the light red and grey colours of DHBW.

What was changed on purpose, see [../decisions.md](../decisions.md): five checkpoints became eight, duo and nationality ranking tabs were removed (not in scope), the fixed 480 px column became a fully responsive layout, the browser mock-up frame was removed, the web font loaded from a CDN is now self-hosted, and the quiz and menu follow [../arena/menu-and-quiz-ui-spec.md](../arena/menu-and-quiz-ui-spec.md).

## Second prototype: `after-prompt/`

[after-prompt/](after-prompt/) holds the sources of the second export ("campusGO Prototype Design after prompt": `src/*.tsx`, `data.ts`, German texts `de.ts`, `index.css`, DHBW logo). This is the design the running app follows (see [../decisions.md](../decisions.md) D5 and D11 to D14). It is a reference only and is not built or linted. Its `AGENTS.md` and `CLAUDE.md` files belong to the export and were not copied.
