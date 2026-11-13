# Question Bank

Source of truth for the quiz content (BR09, BR10, BR11). The questions are loaded into the database by a seed script (see [data-model.md](data-model.md) §4); this file is where the team writes and reviews them first. Rules: [business-rules.md](business-rules.md) (R-16, R-17).

## Current bank (2026-11-12)

The team's bank from the *Main Project Document* (pages 7 to 14) is in the seed:
[backend/src/db/question-bank.js](../backend/src/db/question-bank.js), **69 questions**: Mensa, Library, Building B and
Building C 8 normal + 3 hard each, Sensoricum 7, CAS Cafe, Care.box and Shop.box and Campus Garden 6 each. `npm run
db:seed` puts it into the database once (marker `question_bank_v1`); in an older database it switches off the
PLACEHOLDER questions nobody edited. After that the questions are edited in the admin area (Quests), not here.

Photos taken on site by the team are attached to 17 questions (`frontend/public/quests`, table `question_images`).
A photo the question needs ("how many of these lights", "the number on the shelf shown") is shown **with the
question**; a photo that would give the answer away (a room sign, a price tag, a building number) is shown only
**after answering**, next to the right answer, as "Where to find it".

Still to check by the team:

- Two questions have two right answers in the document (Building B "IT support rooms", Library "quiet floors"), so
  they are multi-select (MULTI, BR50). Since 2026-11-13 the seed sets Library and Building B to *mixed* once (marker
  `quest_content_v1`, only where an admin has not changed the type), so all 69 questions can be drawn; every
  attempt there holds that one multi-select question.
- Large checkpoints have 8 normal questions, R-16 below asks for 10, so repeated attempts see repeats sooner.
- Library: "What can you do on the third floor?" (answer: study in a quiet environment) and "Which floors are the
  quiet floors?" (4 and 5) seem to contradict each other.
- Building C "How many steps": the document lettered the options e to h; the first option (40-45) is the right one.
- Small wording fixes were made (for example "p.m." and "€0.40"); the meaning is unchanged.
- The quest descriptions and "read first" facts (`QUEST_INFO` in question-bank.js, 2026-11-13) are written only
  from the questions above: every normal question can be answered from them. Hard questions (2,000 points) are about
  what you see on site (steps, shelves, rooms), so their fact says where to look, not the number. The seed replaces
  the PLACEHOLDER texts once; after that admins edit them. `backend/tests/quest-content.test.js` checks that each
  normal question has its answer in the texts. After editing the bank, run `npm run questions:sync` (copy for the
  in-browser mock).

## Rules for authors

- Every question belongs to **exactly one checkpoint** and has **four options (A-D) with exactly one correct answer** (BR10). Mark the correct option in the `Correct` column.
- Write questions about **facts a student can learn at that place** (how a facility works, opening hours, where something is, what to do). No trick questions, no questions that need Google.
- Normal question = 1,000 points, hard question = 2,000 points (hard only for the four large checkpoints, only offered on attempt 1).
- A wrong answer is revealed immediately (BR14): write a short, correct and polite fact, not an opinion.
- Fact-check every question on site before it is marked `verified`. Do not seed `draft` questions.
- Questions are never deleted after play starts; retire them (`is_active = false`).
- Language: English (international students).

## Minimum sizes (R-16)

| Checkpoint kind | Questions per attempt | Normal in bank | Hard in bank |
|---|---|---|---|
| Large (Mensa, Library, Building B, Building C) | 5 (attempt 1 may swap the 5th for a hard one) | **10** (the source template shows 8; BR09 asks for 2x the 5 normal questions in play) | **3** |
| Small (Sensoricum, CAS Cafe, Care.box and Shop.box, Campus Garden) | 3 | **6** | 0 |

Total minimum: 4 x (10 + 3) + 4 x 6 = **76 questions** (the source template alone would give 68).

Status values: `draft`, `reviewed`, `verified` (checked on site).

## Mensa

Questions per attempt: **5**. Bank minimum: **10 normal, 3 hard**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |
| 7 | Normal |  |  |  |  |  |  | draft |
| 8 | Normal |  |  |  |  |  |  | draft |
| 9 | Normal |  |  |  |  |  |  | draft |
| 10 | Normal |  |  |  |  |  |  | draft |
| 1 | Hard |  |  |  |  |  |  | draft |
| 2 | Hard |  |  |  |  |  |  | draft |
| 3 | Hard |  |  |  |  |  |  | draft |

> **Sample from the source document (unverified, do not seed):** *How many steps are there on the Mensa staircase?* A. 100 (marked correct in the source) B. 200 C. 300 D. 400. Count the steps on site before using it.

## Library

Questions per attempt: **5**. Bank minimum: **10 normal, 3 hard**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |
| 7 | Normal |  |  |  |  |  |  | draft |
| 8 | Normal |  |  |  |  |  |  | draft |
| 9 | Normal |  |  |  |  |  |  | draft |
| 10 | Normal |  |  |  |  |  |  | draft |
| 1 | Hard |  |  |  |  |  |  | draft |
| 2 | Hard |  |  |  |  |  |  | draft |
| 3 | Hard |  |  |  |  |  |  | draft |

## Building B

Questions per attempt: **5**. Bank minimum: **10 normal, 3 hard**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |
| 7 | Normal |  |  |  |  |  |  | draft |
| 8 | Normal |  |  |  |  |  |  | draft |
| 9 | Normal |  |  |  |  |  |  | draft |
| 10 | Normal |  |  |  |  |  |  | draft |
| 1 | Hard |  |  |  |  |  |  | draft |
| 2 | Hard |  |  |  |  |  |  | draft |
| 3 | Hard |  |  |  |  |  |  | draft |

## Building C

Questions per attempt: **5**. Bank minimum: **10 normal, 3 hard**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |
| 7 | Normal |  |  |  |  |  |  | draft |
| 8 | Normal |  |  |  |  |  |  | draft |
| 9 | Normal |  |  |  |  |  |  | draft |
| 10 | Normal |  |  |  |  |  |  | draft |
| 1 | Hard |  |  |  |  |  |  | draft |
| 2 | Hard |  |  |  |  |  |  | draft |
| 3 | Hard |  |  |  |  |  |  | draft |

## Sensoricum

Questions per attempt: **3**. Bank minimum: **6 normal**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |

## CAS Cafe

Questions per attempt: **3**. Bank minimum: **6 normal**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |

## Care.box and Shop.box

Questions per attempt: **3**. Bank minimum: **6 normal**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |

## Campus Garden

Questions per attempt: **3**. Bank minimum: **6 normal**.

| # | Difficulty | Question | A | B | C | D | Correct | Status |
|---|---|---|---|---|---|---|---|---|
| 1 | Normal |  |  |  |  |  |  | draft |
| 2 | Normal |  |  |  |  |  |  | draft |
| 3 | Normal |  |  |  |  |  |  | draft |
| 4 | Normal |  |  |  |  |  |  | draft |
| 5 | Normal |  |  |  |  |  |  | draft |
| 6 | Normal |  |  |  |  |  |  | draft |

## Question types (BR50)

A question is either **MCQ** (multiple choice: four options, exactly one right) or **MULTI** (multi-select: four options, two or three right; the student must tick exactly the right ones). Admins add, edit and archive questions per quest in the admin area (Quests). The seed questions are all MCQ placeholders; a quest set to "both types" needs at least one normal question of each type before it can go live.
