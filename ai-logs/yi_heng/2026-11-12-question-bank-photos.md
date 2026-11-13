# AI Log — Question bank and campus photos

- **Date:** 2026-11-12
- **Team member:** Yi Heng
- **AI tool / model:** Claude Code, Opus
- **Objective:** Put the question bank of the Main Project Document (pages 7 to 14) into the app as the default
  questions, and add the team's organised CampusGO photos to the quests and to their questions.

## AI Prompts Used
1. "at the page 7 and below, it shows the questions and the question bank. can you help to make thoes into all
   added into the question banks and keep those as the default used ones for now?"
2. "I have also uploaded the campusgo photos that are organised and are in the folder. Can you add those photos to
   the quest and to the respective questions?"

## Decisions Made
- All 69 questions are in `backend/src/db/question-bank.js` and seeded once (marker `question_bank_v1`); in an
  existing database the untouched PLACEHOLDER questions are switched off, not deleted (old attempts stay valid).
  Test databases keep the placeholder questions because the automated tests rely on them.
- Two questions have two right answers in the document (IT support rooms, quiet floors): stored as multi-select;
  they are not drawn while the quests are "single choice only". Left for the team to decide.
- Photos: new table `question_images` (migration 013). Photos needed to answer are shown with the question (Library
  shelf number, CAS and Sensoricum lights); photos that would give the answer away are shown only after answering
  ("Where to find it"). General photos replace the Wikimedia stand-ins of Mensa, Library and Care.box/Shop.box.
- Every photo was resized (max 1600 px) and re-encoded without metadata (no GPS location); identical files are
  stored once. No identifiable people were found in the photos.
- Light wording fixes only (p.m., €0.40, Building C step options e-h read as a-d). Open content points are listed
  in `docs/question-bank.md`. Nothing was committed by the AI.
