import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { QUEST_INFO, QUESTION_BANK } from '../src/db/question-bank.js';
import { CHECKPOINTS, seedQuestContent, seedQuestionBank } from '../src/db/seed.js';
import { QUEST_CONTENT_SEEDED, readSetting } from '../src/services/settings.js';
import { createTestContext } from './helpers.js';

const ctx = await createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

// For every normal question: the words of the description or facts that answer it. A new bank question without a
// line here (or whose answer is not in the texts) fails the test, so the read-first page stays complete.
const ANSWERED_BY = {
  Mensa: {
    'How is the price of food calculated?': 'based on its weight',
    'Which payment method is available at Mensa?': 'Campus Card or a guest card',
    'When is Mensa usually open on weekdays?': 'Monday to Friday from 7:30 a.m. to 3:00 p.m.',
    'Is Mensa open on Saturdays?': 'Saturday from 11:00 a.m. to 2:00 p.m.',
    'Where is Mensa located?': 'Building 8',
    'Where can you get a guest card to pay at Mensa?': 'guest card on site at the Mensa',
    'Where are the trays returned after eating?': 'tray return station',
    'Where are the restrooms located in Mensa?': 'same floor as the dining area',
  },
  'Building B': {
    'How many floors can you access in Building B?': 'You can use 4 floors',
    'What is the building number of Building B on the Bildungscampus?': 'Building 4',
    'Can you top up your Campus Card in this building?':
      'top up your Campus Card on the first floor',
    'What position is NYP and FEN UChile located on the wall?':
      'NYP is in position 10 and FEN UChile in position 21',
    'How many overseas university partners are on the wall?': '21 overseas partner universities',
    'Where are the IT support rooms located?': 'B.0.09 and B.0.10',
    'If you are looking for room B.1.06, which floor should you go to?':
      'B.1.06 is in Building B on floor 1',
    'What time does Building B close?': 'closes at 5:00 p.m.',
  },
  'Building C': {
    'If you are looking for room C.1.14, which floor should you go to?':
      'C.1.14 is on the first floor',
    'How many floors can you access in Building C?': 'You can use 3 floors',
    'Can you top up your Campus Card in this building?': 'no Campus Card top-up machine',
    "What is the room number of the women's restroom on the second floor of the building?":
      'R.2.14',
    'What is the building number of Building C on the Bildungscampus?': 'Building 5',
    'What is the room number of Prof. Dr. Aliona von der Trenck in Building C?': 'C.0.02',
    'On which floor is the bridge from Building B to Building C?':
      'bridge from Building B is on floor 2',
    'How many study tables are there on the second floor of Building C?': '3 study tables',
  },
  Library: {
    'What does the first number, "3", on the bookshelf shown in the picture represent?':
      'Shelf labels start with the floor number',
    'How many rows are there on one bookshelf?': '6 rows',
    'On which floor can you find the category "Product and Management"?':
      "'Product and Management' is on floor 4",
    'How long can you borrow a book without renewing it?': '21 days',
    "If you are reading a book in the library but haven't borrowed it, where should you return it when you are finished?":
      'book return trolley',
    'Which floors are the quiet floors?': 'Floors 4 and 5 are the quiet floors',
    'What can you do on the third floor of the library?':
      'studying and working in a quiet environment',
    'Where is the water refill station located?': 'water refill station is next to the book return',
  },
  Sensoricum: {
    'How many of these lights are there on the first floor?': '10 of the lights',
    'What is the room number of the Kulinarik Lab (culinary lab)?': 'CO.0.10',
    'How many Toiletten (restrooms) are there in the building?': '2 restrooms',
    'What is the main focus of the Sensoricum building?':
      'food, sensory perception and health research',
    'What is the room number of the Sensoricum Büro Labore office?': 'CO.1.14',
    'How many windows are there in the hallway on the first floor?': '4 windows',
    'Which of the following activities can you perform in the Hygiene and Health Lab?':
      'analyze microorganisms and conduct hygiene tests',
  },
  'CAS Cafe': {
    'How many of these lights are there in the CAS?': '7 of the lights',
    'What is the price difference between paying with a Campus Card and paying normally?': '€0.40',
    'When is the CAS usually closed on weekdays?': 'closed from 5:00 p.m. to 7:30 a.m.',
    'Where is the CAS Cafe located?': 'Building 13',
    'How many types of tea are available at the cafeteria?': '12 types of tea',
    'Which of the following payment methods is available at the CAS Cafe?': 'pay in cash',
  },
  'Care.box and Shop.box': {
    'When can you use the shop.box?': '24 hours a day, 7 days a week',
    'What do you need to do before shopping at the shop.box?': 'register in the shop.box app',
    'Which payment methods are accepted at the shop.box?': 'credit card or Klarna',
    'In which languages are digital medical consultations available at the care.box?':
      'German and English',
    'How early should you arrive at the care.box before your appointment?': '15 minutes before',
    'Where is the care.box located?': 'care.box is next to the shop.box',
  },
  'Campus Garden': {
    'In which building can you find the Campus Garden?': 'Building 1',
    'What kind of meals does the Campus Garden offer?':
      'breakfast, snacks, lunch and an à la carte dinner',
    'How are starters, snacks and lunch served during the day?': 'self-service',
    'Which payment methods can you use during the day?': 'cash or card',
    'What do students and Bildungscampus employees need to show to receive discounted prices?':
      'show their Campus Card',
    'How is the à la carte dinner served?': 'served by staff',
  },
};

const textOf = (name) => [QUEST_INFO[name].description, ...QUEST_INFO[name].facts].join(' ');

describe('BR09 R-62 the read-first texts of the pilot quests (no placeholders)', () => {
  it('BR07 every pilot quest has a description and 1 to 5 facts that fit the columns', () => {
    expect(Object.keys(QUEST_INFO).sort()).toEqual(CHECKPOINTS.map((c) => c[0]).sort());
    for (const [name, info] of Object.entries(QUEST_INFO)) {
      expect(info.description.length, name).toBeGreaterThan(20);
      expect(info.description.length, name).toBeLessThanOrEqual(1000);
      expect(info.facts.length, name).toBeGreaterThanOrEqual(1);
      expect(info.facts.length, name).toBeLessThanOrEqual(5);
      for (const fact of info.facts) expect(fact.length, fact).toBeLessThanOrEqual(300);
      expect(textOf(name)).not.toMatch(/PLACEHOLDER/i);
    }
  });

  it('BR09 every normal question can be answered from its quest description and facts', () => {
    for (const [name, questions] of Object.entries(QUESTION_BANK)) {
      for (const question of questions.filter((q) => q.difficulty === 'NORMAL')) {
        const answer = ANSWERED_BY[name]?.[question.text];
        expect(answer, `${name}: no answer line for "${question.text}"`).toBeDefined();
        expect(textOf(name).toLowerCase(), `${name}: ${question.text}`).toContain(
          answer.toLowerCase(),
        );
      }
    }
  });

  it('BR14 hard questions stay an on-site challenge: their facts say where to look, not the number', () => {
    const hardAnswers = { Mensa: ['28', '20 tray', '3 trash'], 'Building B': ['B.3.30', '24-27'] };
    for (const [name, answers] of Object.entries(hardAnswers)) {
      for (const answer of answers)
        expect(textOf(name), `${name}: ${answer}`).not.toContain(answer);
    }
    for (const name of ['Mensa', 'Library', 'Building B', 'Building C']) {
      expect(textOf(name), name).toMatch(/Hard questions \(2,000 points\)/);
    }
  });
});

describe('BR11 BR50 BR55 seeding the quest texts and the multi-select questions', () => {
  /** Runs `work` inside a transaction that is always rolled back (the test DB keeps its placeholders). */
  async function rolledBack(work) {
    const conn = await ctx.pool.getConnection();
    try {
      await conn.beginTransaction();
      return await work(conn);
    } finally {
      await conn.rollback();
      conn.release();
    }
  }

  const questOf = async (conn, name) => {
    const [[quest]] = await conn.query(
      'SELECT checkpoint_id, description, type_mode FROM checkpoints WHERE checkpoint_name = ?',
      [name],
    );
    const [facts] = await conn.query(
      'SELECT fact_text FROM checkpoint_facts WHERE checkpoint_id = ? ORDER BY position',
      [quest.checkpoint_id],
    );
    return { ...quest, facts: facts.map((f) => f.fact_text) };
  };

  it('BR11 replaces the placeholder descriptions and facts with the real ones, once', async () => {
    await rolledBack(async (conn) => {
      await seedQuestionBank(conn);
      const done = await seedQuestContent(conn);
      expect(done).toEqual({ described: 8, facts: 8, mixed: 2 });
      for (const name of Object.keys(QUEST_INFO)) {
        const quest = await questOf(conn, name);
        expect(quest.description).toBe(QUEST_INFO[name].description);
        expect(quest.facts).toEqual(QUEST_INFO[name].facts);
      }
      expect(await readSetting(conn, QUEST_CONTENT_SEEDED)).toBe('true');
      // BR55: once done, an admin's later changes are never overwritten.
      await conn.query("UPDATE checkpoints SET description = 'PLACEHOLDER again'");
      expect(await seedQuestContent(conn)).toEqual({ described: 0, facts: 0, mixed: 0 });
    });
  });

  it('BR50 Library and Building B become mixed, so their multi-select bank questions are drawn', async () => {
    await rolledBack(async (conn) => {
      await seedQuestionBank(conn);
      await seedQuestContent(conn);
      const modes = {};
      for (const name of Object.keys(QUEST_INFO))
        modes[name] = (await questOf(conn, name)).type_mode;
      expect(
        Object.keys(modes)
          .filter((n) => modes[n] === 'MIXED')
          .sort(),
      ).toEqual(['Building B', 'Library']);
    });
  });

  it('BR55 descriptions, facts and question types an admin chose are kept', async () => {
    await rolledBack(async (conn) => {
      await seedQuestionBank(conn);
      const library = await questOf(conn, 'Library');
      await conn.query(
        "UPDATE checkpoints SET description = 'Written by an admin', type_mode = 'MULTI_ONLY' WHERE checkpoint_id = ?",
        [library.checkpoint_id],
      );
      await conn.query(
        "UPDATE checkpoint_facts SET fact_text = 'An admin fact' WHERE checkpoint_id = ? AND position = 1",
        [library.checkpoint_id],
      );
      await seedQuestContent(conn);
      const after = await questOf(conn, 'Library');
      expect(after.description).toBe('Written by an admin');
      expect(after.type_mode).toBe('MULTI_ONLY');
      expect(after.facts[0]).toBe('An admin fact');
      expect(after.facts.some((f) => f.startsWith('PLACEHOLDER'))).toBe(true);
    });
  });

  it('BR50 a quest without an active multi-select question stays single choice', async () => {
    await rolledBack(async (conn) => {
      // Only the placeholder questions (all single choice), no bank: nothing is switched to mixed.
      const done = await seedQuestContent(conn);
      expect(done.mixed).toBe(0);
    });
  });
});
