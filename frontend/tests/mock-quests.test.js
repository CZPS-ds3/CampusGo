import { beforeEach, describe, expect, it } from 'vitest';
import { createMockApi } from '../src/api/mock.js';

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let api;
const LINK = 'https://www.google.com/maps/@49.1502,9.2201,19z';
const option = (text, isCorrect = false) => ({ text, isCorrect });
const question = (text, type) => ({
  questionText: text,
  difficulty: 'NORMAL',
  questionType: type,
  options:
    type === 'MCQ'
      ? [option('A', true), option('B'), option('C'), option('D')]
      : [option('A', true), option('B', true), option('C'), option('D')],
});

async function signInAsAdmin() {
  await api.verify({
    email: 'sekretariat.dski@heilbronn.dhbw.de',
    otp: '123456',
    firstName: 'Study',
    lastName: 'Office',
  });
}

beforeEach(() => {
  sessionStorage.clear();
  api = createMockApi(ApiError, () => () => {});
});

describe('BR49 BR50 the mock keeps the quest rules of the server', () => {
  it('BR49 only administrators reach the quest endpoints', async () => {
    await api.verify({
      email: 'ada@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    await expect(api.admin.quests()).rejects.toMatchObject({ status: 403 });
  });

  it('BR51 a quest needs a usable link, and the reason is returned', async () => {
    await signInAsAdmin();
    const body = { name: 'Gym', mapLink: 'nonsense', questionCount: 3, passThreshold: 2 };
    await expect(api.admin.createQuest(body)).rejects.toMatchObject({
      code: 'INVALID_MAP_LINK',
      details: { reason: 'NOT_A_LINK' },
    });
    await expect(
      api.admin.createQuest({ ...body, mapLink: 'https://www.google.com/maps/@10,10,12z' }),
    ).rejects.toMatchObject({ details: { reason: 'OUTSIDE_MAP_AREA' } });
  });

  it('BR50 a mixed quest is switched on only with both types, and students see the types', async () => {
    await signInAsAdmin();
    const { quest } = await api.admin.createQuest({
      name: 'Gym',
      mapLink: LINK,
      questionCount: 3,
      passThreshold: 2,
      typeMode: 'MIXED',
    });
    for (const text of ['One', 'Two', 'Three']) {
      await api.admin.createQuestion(quest.id, question(text, 'MCQ'));
    }
    await expect(api.admin.updateQuest(quest.id, { isActive: true })).rejects.toMatchObject({
      code: 'QUEST_NOT_READY',
    });
    await api.admin.createQuestion(quest.id, question('Fruit?', 'MULTI'));
    await api.admin.updateQuest(quest.id, { isActive: true });
    const { checkpoints } = await api.checkpoints();
    expect(checkpoints.find((c) => c.name === 'Gym')).toMatchObject({
      typeMode: 'MIXED',
      questionTypes: ['MCQ', 'MULTI'],
    });
  });

  it('BR50 a multi-select question needs the exact right set', async () => {
    await signInAsAdmin();
    const { quest } = await api.admin.createQuest({
      name: 'Gym',
      mapLink: LINK,
      questionCount: 3,
      passThreshold: 2,
      typeMode: 'MULTI_ONLY',
    });
    for (const text of ['One', 'Two', 'Three']) {
      await api.admin.createQuestion(quest.id, question(text, 'MULTI'));
    }
    await api.admin.updateQuest(quest.id, { isActive: true });
    const started = await api.verifyLocation(quest.id, {});
    const attempt = started.attempt;
    const current = attempt.questions.find((q) => q.number === attempt.currentQuestion);
    expect(current.type).toBe('MULTI');
    const bank = (await api.admin.quest(quest.id)).questions.find((q) => q.id === current.id);
    const rightIds = bank.options.filter((o) => o.isCorrect).map((o) => o.id);

    const partial = await api.answer(attempt.id, [rightIds[0]]);
    expect(partial.correct).toBe(false);
    expect(partial.correctOptionIds).toEqual(rightIds);
    const next = partial.attempt.questions.find(
      (q) => q.number === partial.attempt.currentQuestion,
    );
    const nextBank = (await api.admin.quest(quest.id)).questions.find((q) => q.id === next.id);
    const exact = await api.answer(
      attempt.id,
      nextBank.options.filter((o) => o.isCorrect).map((o) => o.id),
    );
    expect(exact.correct).toBe(true);
  });

  it('BR49 an admin deletes a quest nobody played, and the options need exactly one right answer for MCQ', async () => {
    await signInAsAdmin();
    const { quest } = await api.admin.createQuest({
      name: 'Gym',
      mapLink: LINK,
      questionCount: 3,
      passThreshold: 2,
    });
    await expect(
      api.admin.createQuestion(quest.id, {
        ...question('Bad', 'MCQ'),
        options: [option('A', true), option('B', true), option('C'), option('D')],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_QUEST' });
    await expect(api.admin.deleteQuest(quest.id)).resolves.toEqual({ result: 'erased' });
    await expect(api.admin.quest(quest.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('BR44 BR45 BR47 BR48 team and account rules in the mock', () => {
  it('BR44 BR45 the leader removes members; anyone cancels an invitation', async () => {
    await api.verify({
      email: 'ada@heilbronn.dhbw.de',
      otp: '123456',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    const { team } = await api.createTeam('Owls');
    expect(team.leaderId).toBe(1);
    await api.invite('mia.k@heilbronn.dhbw.de');
    const pending = (await api.myTeam()).team.pending;
    expect(pending).toHaveLength(1);
    const cancelled = await api.cancelInvitation(pending[0].id);
    expect(cancelled.team.pending).toEqual([]);
    await expect(api.removeFromTeam(1)).rejects.toMatchObject({ code: 'CANNOT_REMOVE_SELF' });
  });

  it('BR47 a deleted account is gone for good: no list entry, no detail, no restore', async () => {
    await signInAsAdmin();
    const { users } = await api.admin.users({ q: 'Lars' });
    const lars = users[0];
    await api.admin.deleteUser(lars.id);
    expect((await api.admin.users({ q: 'Lars' })).users).toEqual([]);
    await expect(api.admin.user(lars.id)).rejects.toMatchObject({ status: 404 });
    expect(api.admin.restoreUser).toBeUndefined();
    expect(api.admin.purgeUser).toBeUndefined();
    const overview = await api.admin.overview();
    expect(overview.users).not.toHaveProperty('deleted');
  });

  it('BR53 an admin changes a role; the person leaves their team and starts with no points', async () => {
    await signInAsAdmin();
    const { users } = await api.admin.users({ q: 'Mira' });
    const mira = users[0];
    expect(mira).toMatchObject({ role: 'student' });
    expect(mira.teamId).not.toBeNull();
    const { user } = await api.admin.setRole(mira.id, 'admin');
    expect(user).toMatchObject({ role: 'admin', teamId: null, totalPoints: 0 });
    expect((await api.admin.users({ role: 'admin' })).users.map((u) => u.id)).toContain(mira.id);
    expect((await api.admin.users({ role: 'student' })).users.map((u) => u.id)).not.toContain(
      mira.id,
    );
    await expect(api.admin.deleteUser(mira.id)).rejects.toMatchObject({ status: 403 });
    await api.admin.setRole(mira.id, 'student');
    await expect(api.admin.setRole(mira.id, 'owner')).rejects.toMatchObject({ status: 400 });
    await api.admin.deleteUser(mira.id);
  });

  it('BR46 an admin adds a student without a team to a team', async () => {
    await signInAsAdmin();
    const { users } = await api.admin.users({ noTeam: '1' });
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((u) => u.teamId === null && u.status === 'active')).toBe(true);
    await api.admin.addTeamMember(2, users[0].id);
    await expect(api.admin.addTeamMember(1, users[0].id)).rejects.toMatchObject({
      code: 'ALREADY_IN_TEAM',
    });
  });

  it('BR48 one map style per account, saved and reset', async () => {
    await signInAsAdmin();
    expect((await api.mapStyle()).style.base).toBe('follow');
    const saved = await api.saveMapStyle({ base: 'dark', highlight: 'rgb(0, 128, 255)' });
    expect(saved.style).toMatchObject({ base: 'dark', highlight: '#0080ff' });
    await expect(api.saveMapStyle({ highlight: 'banana' })).rejects.toMatchObject({
      code: 'INVALID_MAP_STYLE',
    });
    expect((await api.mapStyle()).style.base).toBe('dark');
    expect((await api.resetMapStyle()).style.base).toBe('follow');
  });
});
