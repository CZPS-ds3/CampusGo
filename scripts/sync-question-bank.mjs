// Copies the team's question bank and quest texts (backend/src/db/question-bank.js) into
// frontend/src/api/question-bank.json for the in-browser mock (npm run dev:mock, browser tests). The web app's
// Docker image is built from frontend/ only, so the mock cannot import the backend file. Run after editing the bank:
//   npm run questions:sync
// frontend/tests/question-bank-copy.test.js fails while the copy differs from the bank.
import { writeFileSync } from 'node:fs';
import {
  QUEST_INFO,
  QUESTION_BANK,
  QUESTION_PHOTO_CREDIT,
} from '../backend/src/db/question-bank.js';

const target = new URL('../frontend/src/api/question-bank.json', import.meta.url);
const copy = { credit: QUESTION_PHOTO_CREDIT, bank: QUESTION_BANK, info: QUEST_INFO };
writeFileSync(target, `${JSON.stringify(copy, null, 2)}\n`);
console.log('[questions] frontend/src/api/question-bank.json updated');
