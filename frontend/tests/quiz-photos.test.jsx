import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Quiz from '../src/pages/Quiz.jsx';

const api = vi.hoisted(() => ({ attempt: vi.fn(), answer: vi.fn() }));
vi.mock('../src/api/client.js', () => ({ api }));

const WITH = { url: '/quests/library/q01-shelf-number.jpg', alt: 'Shelf label', credit: 'Team' };
const AFTER = { url: '/quests/library/q09-sap-erp-shelf-1.jpg', alt: 'SAP shelf', credit: 'Team' };

function question(number, extra = {}) {
  return {
    number,
    id: 100 + number,
    text: `Question ${number}?`,
    difficulty: 'NORMAL',
    type: 'MCQ',
    options: [1, 2, 3, 4].map((p) => ({ id: number * 10 + p, position: p, text: `Option ${p}` })),
    selectedOptionId: null,
    selectedOptionIds: [],
    answered: false,
    images: [],
    answerImages: [],
    ...extra,
  };
}

function attempt(questions, currentQuestion = 1) {
  const now = Date.now();
  return {
    id: 7,
    checkpointId: 2,
    checkpointName: 'Library',
    attemptNumber: 1,
    multiplierPercent: 100,
    status: 'active',
    startTime: new Date(now).toISOString(),
    expiresAt: new Date(now + 300_000).toISOString(),
    serverNow: new Date(now).toISOString(),
    questionCount: questions.length,
    passThreshold: 1,
    hardUnlocked: false,
    hardAccepted: false,
    timeLimitSeconds: 300,
    currentQuestion,
    questions,
  };
}

function renderQuiz() {
  return render(
    <MemoryRouter initialEntries={['/quiz/7']}>
      <Routes>
        <Route path="/quiz/:id" element={<Quiz />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.attempt.mockReset();
  api.answer.mockReset();
});

describe('BR14 question photos in the quiz', () => {
  it('BR14 a photo needed to answer is shown with the question, uncropped', async () => {
    api.attempt.mockResolvedValue({
      attempt: attempt([question(1, { images: [WITH] }), question(2)]),
    });
    renderQuiz();
    const photos = await screen.findByRole('group', { name: 'Photos for this question' });
    expect(photos).toHaveClass('carousel--whole');
    expect(within(photos).getByRole('img', { name: 'Shelf label' })).toHaveAttribute(
      'src',
      WITH.url,
    );
    expect(screen.queryByText('Where to find it')).toBeNull();
  });

  it('BR14 a photo that shows the answer appears only after answering, next to the right answer', async () => {
    const first = question(1);
    api.attempt.mockResolvedValue({ attempt: attempt([first, question(2)]) });
    api.answer.mockResolvedValue({
      correct: false,
      correctOptionIds: [12],
      correctOptionId: 12,
      attempt: attempt(
        [
          { ...first, answered: true, correct: false, answerImages: [AFTER], selectedOptionId: 11 },
          question(2),
        ],
        2,
      ),
    });
    const user = userEvent.setup();
    renderQuiz();
    await screen.findByText('Question 1?');
    expect(screen.queryByRole('img', { name: 'SAP shelf' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Option 1/ }));
    const reveal = await screen.findByRole('group', { name: 'Where to find it' });
    expect(within(reveal).getByRole('img', { name: 'SAP shelf' })).toHaveAttribute(
      'src',
      AFTER.url,
    );
  });

  it('BR14 a question without photos shows no photo area', async () => {
    api.attempt.mockResolvedValue({ attempt: attempt([question(1)]) });
    renderQuiz();
    await screen.findByText('Question 1?');
    expect(screen.queryByRole('group', { name: 'Photos for this question' })).toBeNull();
  });
});
