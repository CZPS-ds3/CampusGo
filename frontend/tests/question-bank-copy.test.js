// The in-browser mock serves a copy of the team's question bank (src/api/question-bank.json). It must stay the same as
// backend/src/db/question-bank.js; after editing the bank run "npm run questions:sync".
import { describe, expect, it } from 'vitest';
import {
  QUEST_INFO,
  QUESTION_BANK,
  QUESTION_PHOTO_CREDIT,
} from '../../backend/src/db/question-bank.js';
import copy from '../src/api/question-bank.json';

describe('BR11 the mock uses the same question bank and quest texts as the server', () => {
  it('BR11 the copy equals backend/src/db/question-bank.js (else run npm run questions:sync)', () => {
    expect(copy).toEqual(
      JSON.parse(
        JSON.stringify({ credit: QUESTION_PHOTO_CREDIT, bank: QUESTION_BANK, info: QUEST_INFO }),
      ),
    );
  });
});
