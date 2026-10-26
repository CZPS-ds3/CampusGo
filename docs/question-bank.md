# Question Bank

Source of truth for the quiz content (BR09, BR10, BR11). The questions are loaded into the database by a seed script (see [data-model.md](data-model.md) §4); this file is where the team writes and reviews them first. Rules: [business-rules.md](business-rules.md) (R-16, R-17).

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
| Small (Containers, CAS Cafe, Care.box and Shop.box, Campus Garden) | 3 | **6** | 0 |

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

## Containers

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

