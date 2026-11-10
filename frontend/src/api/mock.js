// In-browser stand-in for the backend (npm run dev:mock, e2e tests). Same shapes and rules as the real API,
// kept deliberately small: the real rules live in backend/. State survives a page refresh (sessionStorage).

import places from './places.json';
import { DEFAULT_MAP_STYLE, cleanStyle } from '../mapStyle.js';
import { normalizeColor } from '../colors.js';
import { parseMapLink } from './mapLink.js';

const STORAGE_KEY = 'cq-mock-v2';
const SECOND = 1000;
const OTP = '123456';
const DOMAIN = 'heilbronn.dhbw.de';
const MAX_ACCURACY_M = 200;
const GEOFENCE_SLACK_M = 30; // grace zone added to every radius
const ACCURACY_CREDIT_M = 50; // at most this much of a reading's error margin counts for the student
const NEARER_MARGIN_M = 20; // another checkpoint must be this much nearer to win
const MAX_POSITION_AGE_MS = 30_000;
// The pre-seeded administrators, as on the server (BR26): they may be outside the school domain.
const ADMIN_EMAILS = [`sekretariat.dski@${DOMAIN}`, 'dhbw.campusgo@gmail.com'];
const PLACE_SLUGS = {
  Mensa: 'mensa',
  Library: 'library',
  'CAS Cafe': 'cas-cafe',
  'Campus Garden': 'campus-garden',
  'Care.box and Shop.box': 'carebox-shopbox',
  'Building B': 'building-b',
  'Building C': 'building-c',
  Sensoricum: 'sensoricum',
};
// Accounts the mock "knows": an invitation is only created for these (the reply stays the same for everyone).
const KNOWN_EMAILS = ['mia.k', 'jonas', 'aiko.t', 'sara.l'].map((n) => `${n}@${DOMAIN}`);
const BANNED_SUBSTRING = ['fuck', 'shit', 'bitch', 'scheiss', 'arschloch', 'wichser', 'hurensohn'];
const BANNED_TOKEN = ['ass', 'cunt', 'sex', 'arsch', 'hure', 'nutte'];

/** Small copy of the server's name filter: whole words for short terms, so "Cass" stays allowed. */
const bannedWord = (text, extra = []) => {
  const words = String(text ?? '')
    .replace(/([a-zäöü])([A-ZÄÖÜ])/g, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.toLowerCase().replace(/ß/g, 'ss'))
    .filter(Boolean);
  return (
    words
      .map(
        (w) =>
          [...BANNED_TOKEN, ...extra].find((b) => b === w) ??
          BANNED_SUBSTRING.find((b) => w.includes(b)),
      )
      .find(Boolean) ?? null
  );
};

// Same centres, radii and status as backend/src/db/seed.js (Bildungscampus Heilbronn).
const CHECKPOINTS = [
  ['Mensa', 49.148464, 9.215808, 80, 5, 4, true, true],
  ['Library', 49.149493, 9.216467, 80, 5, 4, true, true],
  ['CAS Cafe', 49.148951, 9.216205, 60, 3, 2, false, true],
  ['Campus Garden', 49.147082, 9.217206, 70, 3, 2, false, true],
  ['Care.box and Shop.box', 49.149088, 9.21727, 60, 3, 2, false, true],
  ['Building B', 49.147126, 9.218486, 80, 5, 4, true, true],
  ['Building C', 49.147316, 9.2179, 80, 5, 4, true, true],
  ['Sensoricum', 49.14762, 9.217807, 60, 3, 2, false, true],
].map(([name, latitude, longitude, radius, questionCount, passThreshold, hard, isActive], i) => ({
  id: i + 1,
  name,
  latitude,
  longitude,
  radius,
  isActive,
  questionCount,
  passThreshold,
  hardQuestionEnabled: hard,
  images: (places[PLACE_SLUGS[name]] ?? []).map((p) => ({
    url: `/places/${p.file}`,
    alt: p.alt,
    credit: p.credit,
  })),
}));

const mockQuestion = (id, difficulty, type, text, correctPositions) => ({
  id,
  difficulty,
  type,
  text,
  isActive: true,
  options: [0, 1, 2, 3].map((p) => ({
    id: id * 10 + p,
    position: p + 1,
    text: `Option ${'ABCD'[p]}${correctPositions.includes(p) ? ' (placeholder answer)' : ''}`,
    isCorrect: correctPositions.includes(p),
  })),
});

const seedBank = (c) => {
  const bank = Array.from({ length: 10 }, (_, n) =>
    mockQuestion(
      c.id * 100 + n + 1,
      'NORMAL',
      'MCQ',
      `Practice question ${n + 1} about ${c.name}?`,
      [(c.id + n) % 4],
    ),
  );
  if (c.hardQuestionEnabled) {
    for (const n of [0, 1]) {
      bank.push(
        mockQuestion(
          c.id * 100 + 90 + n,
          'HARD',
          'MCQ',
          `Hard practice question ${n + 1} about ${c.name}?`,
          [(c.id + n) % 4],
        ),
      );
    }
  }
  return bank;
};

// The quests an admin can change live in the state (like the database on the server).
const BASE_QUESTS = CHECKPOINTS.map((c) => ({
  ...c,
  description: `PLACEHOLDER description for ${c.name}.`,
  mapUrl: null,
  timeLimitSeconds: null,
  typeMode: 'MCQ_ONLY',
  archived: false,
  facts: [1, 2, 3].map((n) => `PLACEHOLDER fact ${n} about ${c.name}.`),
  bank: seedBank(c),
}));

const TYPES_OF_MODE = { MCQ_ONLY: ['MCQ'], MULTI_ONLY: ['MULTI'], MIXED: ['MCQ', 'MULTI'] };
const typesOf = (mode) => TYPES_OF_MODE[mode] ?? TYPES_OF_MODE.MCQ_ONLY;
const rightCount = (q) => q.options.filter((o) => o.isCorrect).length;
const playable = (q) =>
  q.isActive &&
  q.options.length === 4 &&
  (q.type === 'MCQ' ? rightCount(q) === 1 : rightCount(q) >= 2 && rightCount(q) <= 3);
const poolOf = (cp, difficulty, types) =>
  cp.bank.filter((q) => q.difficulty === difficulty && types.includes(q.type) && playable(q));

const MULTIPLIERS = [100, 85, 70, 55, 40, 0];
const TEAM_OF = { 101: 'Campus Crew', 102: 'Campus Crew', 103: 'Campus Crew' };
const OTHERS = [
  { id: 101, displayName: 'Mia K.', points: 6290, avatarPreset: 1 },
  { id: 102, displayName: 'Jonas', points: 5320, avatarPreset: 2 },
  { id: 103, displayName: 'Aiko T.', points: 3100, avatarPreset: 3 },
  { id: 104, displayName: 'Sara L.', points: 1200, avatarPreset: 4 },
];

const fresh = () => ({
  loggedIn: false,
  student: null,
  consent: false,
  attempts: [],
  nextId: 1,
  quests: JSON.parse(JSON.stringify(BASE_QUESTS)),
  nextQuestionId: 5000,
  mapStyle: null,
  team: null,
  invitations: [
    {
      id: 9001,
      teamName: 'Campus Crew',
      inviterName: 'Mia K.',
      expiresAt: new Date(Date.now() + 20 * 3600e3).toISOString(),
      status: 'pending',
    },
  ],
  lastOtpEmail: null,
  admin: {
    nextId: 200,
    users: [
      ['Mira', 'Okonkwo', 'Mira', 'active', 7420, 8, 'Bildungscampus Bandits'],
      ['Tomás', 'Herrera', 'Tomi', 'active', 6180, 7, 'Bildungscampus Bandits'],
      ['Aiko', 'Tanabe', 'Aiko', 'active', 3100, 6, 'Mensa Mavericks'],
      ['Lars', 'Nordmann', 'Lars', 'active', 2540, 5, null],
      ['Sam', 'Whitfield', 'Sam', 'blocked', 900, 1, null],
      ['Ben', 'Carver', 'Ben', 'archived', 1200, 1, null],
    ].map(([firstName, lastName, nickname, status, totalPoints, questsPassed, teamName], i) => ({
      id: 100 + i,
      email: `${firstName}.${lastName}@${DOMAIN}`
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .toLowerCase(),
      firstName,
      lastName,
      nickname,
      displayName: nickname,
      role: 'student',
      status,
      statusReason: status === 'blocked' ? 'Repeated misuse (demo)' : null,
      reported: false,
      reportReason: null,
      teamId: teamName ? 1 : null,
      teamName,
      totalPoints,
      questsPassed,
      createdAt: new Date(Date.now() - (9 - i) * 86400e3).toISOString(),
      lastLoginAt: new Date(Date.now() - (i + 1) * 5 * 3600e3).toISOString(),
    })),
    teams: [
      { id: 1, name: 'Bildungscampus Bandits', score: 6800, members: [100, 101] },
      { id: 2, name: 'Mensa Mavericks', score: 3100, members: [102] },
    ],
    terms: [],
  },
});

const distance = (la1, lo1, la2, lo2) => {
  const rad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(la2 - la1) / 2) ** 2 +
    Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(a)));
};

export function createMockApi(ApiError, getUnauthorized) {
  let state = fresh();
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) state = { ...fresh(), ...JSON.parse(saved) };
  } catch {
    state = fresh();
  }
  const save = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be blocked; the mock then simply forgets on refresh */
    }
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, 80));
  const fail = (status, code, message, details) => new ApiError(status, code, message, details);
  const needLogin = () => {
    if (!state.loggedIn) {
      const error = fail(401, 'UNAUTHENTICATED', 'Please log in again.');
      getUnauthorized()(error);
      throw error;
    }
  };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const checkpoint = (id) => state.quests.find((c) => c.id === Number(id));

  const rankFor = (total) => 1 + OTHERS.filter((o) => o.points > total).length;
  const publicStudent = () => ({
    ...state.student,
    totalPoints: totalPoints(),
    rank: state.student.role === 'admin' ? null : rankFor(totalPoints()),
    teamId: state.team ? 1 : null,
    locationConsent: state.consent,
  });
  const totalExact = () => state.attempts.reduce((n, a) => n + (a.pointsExact ?? 0), 0);
  const totalPoints = () => Math.ceil(totalExact() / 100);

  const slotOf = (q, number, replaced = false) => ({
    id: q.id,
    difficulty: q.difficulty,
    type: q.type,
    text: q.text,
    options: q.options.map(({ id, position, text, isCorrect }) => ({
      id,
      position,
      text,
      correct: isCorrect,
    })),
    number,
    selected: null,
    replaced,
  });

  /** The questions of a new attempt; a mixed quest always holds both types, like the server. */
  const slotsFor = (cp, seed) => {
    const rotate = (list) =>
      list.length
        ? [...list.slice(seed % list.length), ...list.slice(0, seed % list.length)]
        : list;
    const types = typesOf(cp.typeMode);
    let picked;
    if (cp.typeMode === 'MIXED') {
      const [mcq] = rotate(poolOf(cp, 'NORMAL', ['MCQ']));
      const [multi] = rotate(poolOf(cp, 'NORMAL', ['MULTI']));
      const rest = rotate(poolOf(cp, 'NORMAL', types)).filter((q) => q !== mcq && q !== multi);
      picked = [mcq, multi, ...rest.slice(0, cp.questionCount - 2)];
    } else {
      picked = rotate(poolOf(cp, 'NORMAL', types)).slice(0, cp.questionCount);
    }
    if (picked.length < cp.questionCount || picked.some((q) => !q)) {
      throw fail(503, 'DRAW_IMPOSSIBLE', 'This checkpoint has too few questions right now.');
    }
    return picked.map((q, i) => slotOf(q, i + 1));
  };

  /** Exact match only (BR50): the ticked options are precisely the right ones. */
  const isRight = (slot) => {
    const right = slot.options.filter((o) => o.correct).map((o) => o.id);
    return (
      slot.selected !== null &&
      right.length === slot.selected.length &&
      right.every((id) => slot.selected.includes(id))
    );
  };

  const finalize = (attempt, reason, nowMs) => {
    const correctCount = attempt.slots.filter(isRight).length;
    const passed = correctCount >= attempt.passThreshold;
    const multiplier = MULTIPLIERS[Math.min(attempt.attemptNumber, 6) - 1];
    const finishedMs = reason === 'expired' ? attempt.expiresMs : nowMs;
    const remaining =
      reason === 'expired' ? 0 : Math.max(0, Math.floor((attempt.expiresMs - finishedMs) / SECOND));
    let base = 0;
    if (passed) {
      for (const s of attempt.slots) {
        if (isRight(s)) base += s.difficulty === 'HARD' ? 2000 : 1000;
      }
    }
    const full = passed && correctCount === attempt.questionCount ? 200 : 0;
    const timeBonus = passed ? remaining : 0;
    const exact = passed ? (base + full + timeBonus) * multiplier : 0;
    Object.assign(attempt, {
      status: passed ? 'passed' : 'failed',
      endReason: reason,
      correctCount,
      basePoints: base,
      timeBonus,
      fullClearBonus: full,
      multiplierPercent: multiplier,
      pointsExact: exact,
      pointsEarned: Math.ceil(exact / 100),
    });
  };

  const sweep = () => {
    const now = Date.now();
    for (const a of state.attempts)
      if (a.status === 'active' && now >= a.expiresMs) finalize(a, 'expired', now);
  };

  const view = (a) => {
    const cp = checkpoint(a.checkpointId);
    const next = a.slots.find((s) => s.selected === null);
    return {
      id: a.id,
      checkpointId: a.checkpointId,
      checkpointName: cp.name,
      attemptNumber: a.attemptNumber,
      multiplierPercent: MULTIPLIERS[Math.min(a.attemptNumber, 6) - 1],
      status: a.status,
      endReason: a.endReason ?? null,
      startTime: new Date(a.startMs).toISOString(),
      expiresAt: new Date(a.expiresMs).toISOString(),
      serverNow: new Date().toISOString(),
      questionCount: a.questionCount,
      passThreshold: a.passThreshold,
      timeLimitSeconds: Math.round((a.expiresMs - a.startMs) / SECOND),
      hardUnlocked: a.hardUnlocked,
      hardAccepted: Boolean(a.slots[a.slots.length - 1]?.replaced),
      currentQuestion: a.status === 'active' && next ? next.number : null,
      questions: a.slots.map((s) => {
        const wrong = s.selected !== null && !isRight(s);
        const q = {
          number: s.number,
          id: s.id,
          text: s.text,
          difficulty: s.difficulty,
          type: s.type,
          options: s.options.map(({ id, position, text }) => ({ id, position, text })),
          selectedOptionId: s.selected?.[0] ?? null,
          selectedOptionIds: s.selected ?? [],
          answered: s.selected !== null,
        };
        if (wrong) {
          q.correctOptionIds = s.options.filter((o) => o.correct).map((o) => o.id);
          q.correctOptionId = q.correctOptionIds[0];
        }
        if (s.selected !== null) q.correct = !wrong;
        return q;
      }),
    };
  };

  const resultOf = (a) => {
    const used = state.attempts.filter((x) => x.checkpointId === a.checkpointId).length;
    return {
      attemptId: a.id,
      checkpointId: a.checkpointId,
      attemptNumber: a.attemptNumber,
      passed: a.status === 'passed',
      status: a.status,
      endReason: a.endReason,
      correctCount: a.correctCount,
      questionCount: a.questionCount,
      passThreshold: a.passThreshold,
      basePoints: a.basePoints,
      timeBonus: a.timeBonus,
      fullClearBonus: a.fullClearBonus,
      multiplierPercent: a.multiplierPercent,
      pointsEarned: a.pointsEarned,
      totalPoints: totalPoints(),
      ...resultRanks(a),
      nextMultiplierPercent: MULTIPLIERS[Math.min(used + 1, 6) - 1],
      checkpointCompleted: state.attempts.some(
        (x) => x.checkpointId === a.checkpointId && x.status === 'passed',
      ),
      nextAttemptNumber: used + 1,
    };
  };

  const ownAttempt = (id) => {
    const a = state.attempts.find((x) => x.id === Number(id));
    if (!a) throw fail(404, 'NOT_FOUND', 'Attempt not found.');
    return a;
  };
  const activeAttempt = () => state.attempts.find((a) => a.status === 'active') ?? null;

  const resultRanks = (a) => {
    if (state.student.role === 'admin')
      return { rankBefore: null, rankAfter: null, team: undefined };
    const before = Math.ceil(Math.max(0, totalExact() - (a.pointsExact ?? 0)) / 100);
    const out = { rankBefore: rankFor(before), rankAfter: rankFor(totalPoints()), team: null };
    if (state.team && state.team.members.length >= 2) {
      const others = state.team.members.filter((m) => !m.self).map((m) => m.totalPoints);
      const average = (own) =>
        Math.ceil([own, ...others].reduce((n, p) => n + p, 0) / (others.length + 1));
      const rivals = [4100, 2000];
      const rankWith = (score) => 1 + rivals.filter((r) => r > score).length;
      out.team = {
        teamName: state.team.name,
        teamScoreBefore: average(before),
        teamScoreAfter: average(totalPoints()),
        teamRankBefore: rankWith(average(before)),
        teamRankAfter: rankWith(average(totalPoints())),
      };
    }
    return out;
  };

  const teamView = () =>
    state.team && {
      id: 1,
      name: state.team.name,
      pictureUrl: null,
      members: state.team.members.map((m) => ({
        ...m,
        avatarPreset: m.self ? state.student.avatarPreset : (m.avatarPreset ?? 1),
        totalPoints: m.self ? totalPoints() : m.totalPoints,
      })),
      leaderId: state.team.leaderId ?? 1,
      pending: (state.team.pending ?? []).filter((p) => Date.parse(p.expiresAt) > Date.now()),
      size: state.team.members.length,
      score: Math.ceil(
        state.team.members.reduce((n, m) => n + (m.self ? totalPoints() : m.totalPoints), 0) /
          state.team.members.length,
      ),
      active: state.team.members.length >= 2,
      hasAdmin: state.student.role === 'admin',
      ranked: state.team.members.length >= 2 && state.student.role !== 'admin',
    };

  const startAttempt = (cp) => {
    const used = state.attempts.filter((a) => a.checkpointId === cp.id).length;
    const now = Date.now();
    const attempt = {
      id: state.nextId,
      checkpointId: cp.id,
      attemptNumber: used + 1,
      startMs: now,
      // The attempt keeps the count and pass mark it started with (BR21).
      questionCount: cp.questionCount,
      passThreshold: cp.passThreshold,
      expiresMs: now + (cp.timeLimitSeconds ?? cp.questionCount * 60) * SECOND,
      status: 'active',
      hardUnlocked: false,
      slots: slotsFor(cp, now % 10),
    };
    state.nextId += 1;
    state.attempts.push(attempt);
    save();
    return { status: 'OK', resumed: false, attempt: view(attempt) };
  };

  const rank = (list) =>
    list.map((e) => ({ ...e, rank: 1 + list.filter((o) => o.points > e.points).length }));

  const methods = {
    async requestOtp(email) {
      const clean = String(email).trim().toLowerCase();
      const school = clean.endsWith(DOMAIN) && clean.split('@').length === 2;
      if (!school && !ADMIN_EMAILS.includes(clean)) {
        throw fail(
          400,
          'INVALID_EMAIL',
          `Please use your school e-mail address (ending with ${DOMAIN}).`,
        );
      }
      state.lastOtpEmail = clean;
      save();
      return { message: 'If the account exists, an email containing the OTP has been sent.' };
    },
    async verify({ email, otp, firstName, lastName, nickname, avatarPreset }) {
      const clean = String(email).trim().toLowerCase();
      if (String(otp).replace(/\s/g, '') !== OTP)
        throw fail(400, 'INVALID_CODE', 'Invalid or expired code.');
      if (!state.student || state.student.email !== clean) {
        if (!firstName || !lastName) return { status: 'profile_required' };
        const rude = bannedWord(`${firstName} ${lastName} ${nickname ?? ''}`, state.admin.terms);
        if (rude) throw fail(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
        state.student = {
          id: 1,
          role: ADMIN_EMAILS.includes(clean) ? 'admin' : 'student',
          email: clean,
          firstName,
          lastName,
          nickname: nickname || null,
          avatarPreset: avatarPreset ?? 0,
          displayName: nickname || `${firstName} ${lastName.charAt(0).toUpperCase()}.`,
          pictureUrl: null,
        };
      }
      state.loggedIn = true;
      save();
      return { status: 'ok', student: publicStudent() };
    },
    async logout() {
      state.loggedIn = false;
      save();
      return null;
    },
    async resetPoints() {
      needLogin();
      if (state.student.role !== 'admin')
        throw fail(403, 'FORBIDDEN', 'Only administrators can reset their points.');
      state.attempts = [];
      save();
      return { totalPoints: 0 };
    },
    async deleteAccount() {
      needLogin();
      state.loggedIn = false;
      state.student = null;
      state.team = null;
      state.attempts = [];
      state.consent = false;
      save();
      return null;
    },
    async devLastOtp() {
      return { otp: OTP };
    },
    async me() {
      needLogin();
      return { student: publicStudent() };
    },
    async uploadPicture(file) {
      needLogin();
      if (file.size > 2 * 1024 * 1024)
        throw fail(413, 'IMAGE_TOO_LARGE', 'The image is too large (limit 2 MB).');
      if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw fail(400, 'INVALID_IMAGE', 'Please upload a PNG, JPG or WebP image.');
      const url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      state.student.pictureUrl = url;
      save();
      return { pictureUrl: url };
    },
    async setAvatarPreset(preset) {
      needLogin();
      state.student.avatarPreset = preset;
      state.student.pictureUrl = null;
      save();
      return null;
    },
    async consent() {
      needLogin();
      state.consent = true;
      save();
      return null;
    },
    async checkpoints() {
      needLogin();
      sweep();
      return {
        checkpoints: state.quests
          .filter((c) => !c.archived && (c.isActive || state.student?.role === 'admin'))
          .map((c) => {
            const mine = state.attempts.filter((a) => a.checkpointId === c.id);
            return {
              id: c.id,
              name: c.name,
              description: c.description,
              latitude: c.latitude,
              longitude: c.longitude,
              radius: c.radius,
              isActive: c.isActive,
              questionCount: c.questionCount,
              passThreshold: c.passThreshold,
              hardQuestionEnabled: c.hardQuestionEnabled,
              images: c.images,
              facts: c.facts,
              typeMode: c.typeMode,
              questionTypes: typesOf(c.typeMode),
              timeLimitSeconds: c.timeLimitSeconds ?? c.questionCount * 60,
              completed: mine.some((a) => a.status === 'passed'),
              attemptsUsed: mine.length,
              nextAttemptNumber: mine.length + 1,
              bestScore: Math.max(0, ...mine.map((a) => a.pointsEarned ?? 0)),
            };
          }),
      };
    },
    async verifyLocation(id, { latitude, longitude, accuracy, ageMs }) {
      needLogin();
      sweep();
      const cp = checkpoint(id);
      // Administrators test any quiz from anywhere, as often as they like.
      const testMode = state.student?.role === 'admin';
      if (!cp || cp.archived || (!cp.isActive && !testMode))
        throw fail(404, 'NOT_AVAILABLE', 'This checkpoint is not available.');
      if (
        !testMode &&
        state.attempts.some((a) => a.checkpointId === cp.id && a.status === 'passed')
      ) {
        throw fail(409, 'ALREADY_COMPLETED', 'You already completed this checkpoint.');
      }
      const active = activeAttempt();
      if (active?.checkpointId === cp.id)
        return { status: 'OK', resumed: true, attempt: view(active) };
      if (active)
        throw fail(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
          attemptId: active.id,
        });
      if (testMode) {
        state.attempts = state.attempts.filter((a) => a.checkpointId !== cp.id);
        return startAttempt(cp);
      }
      if (!state.consent)
        throw fail(403, 'CONSENT_REQUIRED', 'Please accept the location notice first.');
      if (ageMs < 0 || ageMs > MAX_POSITION_AGE_MS)
        throw fail(422, 'STALE_POSITION', 'Your location reading is too old. Please try again.');
      if (accuracy > MAX_ACCURACY_M)
        throw fail(422, 'ACCURACY_TOO_LOW', 'Your location is not precise enough.');
      const metres = distance(latitude, longitude, cp.latitude, cp.longitude);
      const distanceM = Math.round(metres / 10) * 10;
      const credit = Math.min(accuracy, ACCURACY_CREDIT_M);
      if (metres > cp.radius + GEOFENCE_SLACK_M + credit) {
        return {
          status: 'OUTSIDE',
          distanceM,
          elsewhere: null,
          message: `You are about ${distanceM} m from ${cp.name}. Walk closer and try again.`,
        };
      }
      // Overlapping circles: a reading belongs to the checkpoint with the nearest centre only.
      const nearer = state.quests
        .filter((c) => c.isActive && !c.archived && c.id !== cp.id)
        .map((c) => ({ c, d: distance(latitude, longitude, c.latitude, c.longitude) }))
        .filter(({ c, d }) => d <= c.radius && d + NEARER_MARGIN_M < metres)
        .sort((a, b) => a.d - b.d)[0];
      if (nearer) {
        return {
          status: 'OUTSIDE',
          distanceM,
          elsewhere: nearer.c.name,
          message: `You are at ${nearer.c.name}, not at ${cp.name}. Walk to ${cp.name} and try again.`,
        };
      }
      return startAttempt(cp);
    },
    async activeAttempt() {
      needLogin();
      sweep();
      save();
      const a = activeAttempt();
      return { attempt: a ? view(a) : null };
    },
    async attempt(id) {
      needLogin();
      sweep();
      return { attempt: view(ownAttempt(id)) };
    },
    async answer(id, optionIds) {
      needLogin();
      sweep();
      const a = ownAttempt(id);
      if (a.status !== 'active') {
        throw fail(
          409,
          a.endReason === 'expired' ? 'ATTEMPT_EXPIRED' : 'ATTEMPT_NOT_ACTIVE',
          'This attempt is finished.',
        );
      }
      const slot = a.slots.find((s) => s.selected === null);
      const chosen = [...new Set(Array.isArray(optionIds) ? optionIds : [optionIds])];
      if (!chosen.length || chosen.some((x) => !slot.options.some((o) => o.id === x)))
        throw fail(400, 'INVALID_OPTION', 'That option does not belong to this question.');
      if (slot.type === 'MCQ' && chosen.length !== 1)
        throw fail(400, 'INVALID_OPTION', 'Choose exactly one option.');
      slot.selected = chosen;
      const correct = isRight(slot);
      const cp = checkpoint(a.checkpointId);
      const beforeLast = a.questionCount - 1;
      if (slot.number === beforeLast && a.attemptNumber === 1 && cp.hardQuestionEnabled) {
        a.hardUnlocked =
          a.slots.slice(0, beforeLast).every(isRight) &&
          poolOf(cp, 'HARD', typesOf(cp.typeMode)).length > 0;
      }
      const last = a.slots.every((s) => s.selected !== null);
      if (last) finalize(a, 'completed', Date.now());
      save();
      const response = { correct, attempt: view(a) };
      if (!correct) {
        response.correctOptionIds = slot.options.filter((o) => o.correct).map((o) => o.id);
        response.correctOptionId = response.correctOptionIds[0];
      }
      if (last) response.result = resultOf(a);
      return response;
    },
    async acceptHard(id) {
      needLogin();
      const a = ownAttempt(id);
      const lastIndex = a.questionCount - 1;
      const slot = a.slots[lastIndex];
      if (
        a.status !== 'active' ||
        !a.hardUnlocked ||
        !slot ||
        slot.selected !== null ||
        slot.replaced
      ) {
        throw fail(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      }
      const cp = checkpoint(a.checkpointId);
      const [hard] = poolOf(cp, 'HARD', typesOf(cp.typeMode));
      if (!hard) throw fail(409, 'HARD_NOT_AVAILABLE', 'The hard question is not available.');
      a.slots[lastIndex] = slotOf(hard, a.questionCount, true);
      save();
      return { attempt: view(a) };
    },
    async result(id) {
      needLogin();
      sweep();
      const a = ownAttempt(id);
      if (a.status === 'active')
        throw fail(409, 'ATTEMPT_NOT_FINISHED', 'This attempt is still running.');
      return { result: resultOf(a) };
    },
    async myTeam() {
      needLogin();
      return { team: teamView() };
    },
    async createTeam(name) {
      needLogin();
      if (state.team) throw fail(409, 'ALREADY_IN_TEAM', 'You are already in a team.');
      if (bannedWord(name, state.admin.terms))
        throw fail(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
      state.team = {
        name,
        leaderId: 1,
        members: [
          {
            id: 1,
            displayName: state.student.displayName,
            pictureUrl: null,
            self: true,
            totalPoints: 0,
          },
        ],
      };
      state.invitations = [];
      save();
      return { team: teamView() };
    },
    async uploadTeamPicture() {
      needLogin();
      return { pictureUrl: null };
    },
    async invite(email) {
      needLogin();
      if (!state.team) throw fail(403, 'NO_TEAM', 'Create a team first.');
      if (!String(email).trim().toLowerCase().endsWith(DOMAIN)) {
        throw fail(
          400,
          'INVALID_EMAIL',
          `Please enter a school e-mail address (ending with ${DOMAIN}).`,
        );
      }
      const taken = state.team.members.length + (state.team.pending ?? []).length;
      if (taken >= 5) {
        throw fail(
          409,
          'TEAM_FULL',
          'Your team is full: members plus open invitations already make 5.',
        );
      }
      const known = KNOWN_EMAILS.includes(String(email).trim().toLowerCase());
      if (known) {
        state.team.pending = [
          ...(state.team.pending ?? []),
          {
            id: state.nextId++,
            expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(),
            invitedEmail: String(email).trim().toLowerCase(),
            displayName: String(email).split('@')[0],
          },
        ];
        save();
      }
      return { message: 'If the user exists and can be invited, an invitation has been sent.' };
    },
    async invitePlayer(playerId) {
      needLogin();
      if (!state.team) throw fail(403, 'NO_TEAM', 'Create a team first.');
      if (state.team.members.length + (state.team.pending ?? []).length >= 5)
        throw fail(
          409,
          'TEAM_FULL',
          'Your team is full: members plus open invitations already make 5.',
        );
      const other = OTHERS.find((o) => o.id === Number(playerId));
      if (other && !TEAM_OF[other.id]) {
        state.team.pending = [
          ...(state.team.pending ?? []),
          {
            id: state.nextId++,
            expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString(),
            invitedEmail: null,
            displayName: other.displayName,
          },
        ];
        save();
      }
      return { message: 'If the user exists and can be invited, an invitation has been sent.' };
    },
    async player(id) {
      needLogin();
      const isYou = Number(id) === 1;
      const other = OTHERS.find((o) => o.id === Number(id));
      if (!isYou && !other) throw fail(404, 'NOT_FOUND', 'Player not found.');
      const points = isYou ? totalPoints() : other.points;
      const teamName = isYou ? (state.team?.name ?? null) : (TEAM_OF[other.id] ?? null);
      const members = isYou
        ? (teamView()?.members ?? [])
        : OTHERS.filter((o) => TEAM_OF[o.id] === teamName).map((o) => ({
            id: o.id,
            displayName: o.displayName,
            pictureUrl: null,
            avatarPreset: o.avatarPreset,
            totalPoints: o.points,
          }));
      const free = state.team && state.team.members.length + (state.team.pending ?? []).length < 5;
      return {
        player: {
          id: Number(id),
          displayName: isYou ? state.student.displayName : other.displayName,
          pictureUrl: isYou ? state.student.pictureUrl : null,
          avatarPreset: isYou ? state.student.avatarPreset : other.avatarPreset,
          totalPoints: points,
          rank: rankFor(points),
          questsCleared: isYou
            ? new Set(
                state.attempts.filter((a) => a.status === 'passed').map((a) => a.checkpointId),
              ).size
            : Math.floor(points / 1500),
          isYou,
          canInvite: Boolean(!isYou && free && !teamName),
          team: teamName
            ? {
                id: isYou ? 1 : 11,
                name: teamName,
                pictureUrl: null,
                score: Math.round(members.reduce((n, m) => n + m.totalPoints, 0) / members.length),
                rank: members.length >= 2 ? 1 : null,
                members,
              }
            : null,
        },
      };
    },
    async invitations() {
      needLogin();
      return { invitations: copy(state.invitations) };
    },
    async acceptInvitation(id) {
      needLogin();
      const invitation = state.invitations.find((i) => i.id === Number(id));
      if (!invitation || state.team)
        throw fail(409, 'INVITATION_INVALID', 'This invitation is no longer valid.');
      state.team = {
        name: invitation.teamName,
        leaderId: 101,
        members: [
          { id: 101, displayName: invitation.inviterName, pictureUrl: null, totalPoints: 6290 },
          {
            id: 1,
            displayName: state.student.displayName,
            pictureUrl: null,
            self: true,
            totalPoints: 0,
          },
        ],
      };
      state.invitations = [];
      save();
      return { team: teamView() };
    },
    async rejectInvitation(id) {
      needLogin();
      state.invitations = state.invitations.filter((i) => i.id !== Number(id));
      save();
      return null;
    },
    async cancelInvitation(id) {
      needLogin();
      if (!state.team) throw fail(403, 'NO_TEAM', 'Create a team first.');
      const before = (state.team.pending ?? []).length;
      state.team.pending = (state.team.pending ?? []).filter((p) => p.id !== Number(id));
      if (state.team.pending.length === before)
        throw fail(404, 'NOT_FOUND', 'This invitation is not open any more.');
      save();
      return { team: teamView() };
    },
    async removeFromTeam(studentId) {
      needLogin();
      if (!state.team) throw fail(403, 'NO_TEAM', 'You are not in a team.');
      if ((state.team.leaderId ?? 1) !== 1)
        throw fail(403, 'NOT_LEADER', 'Only the team leader can remove members.');
      if (Number(studentId) === 1)
        throw fail(400, 'CANNOT_REMOVE_SELF', 'The leader cannot remove themselves.');
      if (!state.team.members.some((m) => m.id === Number(studentId)))
        throw fail(404, 'NOT_FOUND', 'This student is not in your team.');
      state.team.members = state.team.members.filter((m) => m.id !== Number(studentId));
      save();
      return { team: teamView() };
    },
    async mapStyle() {
      needLogin();
      return { style: state.mapStyle ?? DEFAULT_MAP_STYLE };
    },
    async saveMapStyle(style) {
      needLogin();
      const problems = [];
      const colours = {
        'tint.color': style?.tint?.color,
        'pins.open': style?.pins?.open,
        'pins.done': style?.pins?.done,
        'pins.locked': style?.pins?.locked,
        highlight: style?.highlight,
        route: style?.route,
      };
      for (const [field, value] of Object.entries(colours)) {
        if (value !== undefined && normalizeColor(value) === null)
          problems.push(`${field}: use a colour like #1a2b3c or rgb(26, 43, 60).`);
      }
      if (problems.length) throw fail(400, 'INVALID_MAP_STYLE', problems[0], { problems });
      state.mapStyle = cleanStyle(style);
      save();
      return { style: state.mapStyle };
    },
    async resetMapStyle() {
      needLogin();
      state.mapStyle = null;
      save();
      return { style: DEFAULT_MAP_STYLE };
    },
    async soloBoard() {
      needLogin();
      const you = {
        id: 1,
        displayName: state.student.displayName,
        pictureUrl: null,
        avatarPreset: state.student.avatarPreset,
        points: totalPoints(),
        isYou: true,
      };
      const ranked = rank(
        [...OTHERS.map((o) => ({ ...o, pictureUrl: null, isYou: false })), you].sort(
          (a, b) => b.points - a.points,
        ),
      );
      return {
        entries: ranked,
        you: { rank: ranked.find((e) => e.isYou).rank, points: you.points },
      };
    },
    async teamBoard() {
      needLogin();
      if (!state.team)
        throw fail(403, 'NO_TEAM', 'Join or create a team to see the team leaderboard.');
      const mine = teamView();
      const others = [
        {
          id: 11,
          name: 'Campus Crew',
          pictureUrl: null,
          points: 4100,
          members: 3,
          isYourTeam: false,
        },
        {
          id: 12,
          name: 'Night Owls',
          pictureUrl: null,
          points: 2000,
          members: 2,
          isYourTeam: false,
        },
      ];
      const entries = mine.ranked
        ? [
            ...others,
            {
              id: 1,
              name: mine.name,
              pictureUrl: null,
              points: mine.score,
              members: mine.size,
              isYourTeam: true,
            },
          ]
        : others;
      const ranked = rank(entries.sort((a, b) => b.points - a.points));
      const own = ranked.find((e) => e.isYourTeam);
      return { entries: ranked, yourTeam: own ? { rank: own.rank, points: own.points } : null };
    },
  };

  const needAdmin = () => {
    needLogin();
    if (state.student?.role !== 'admin')
      throw fail(403, 'FORBIDDEN', 'This area is for administrators.');
  };
  const adminUser = (id) => {
    const user = state.admin.users.find((u) => u.id === Number(id));
    if (!user) throw fail(404, 'NOT_FOUND', 'Account not found.');
    return user;
  };
  const emailTaken = (email, ignoreId) =>
    state.admin.users.some((u) => u.email === email && u.id !== ignoreId);
  const checkAdminEmail = (raw, ignoreId) => {
    const email = String(raw).trim().toLowerCase();
    if (!email.endsWith(DOMAIN) || email.split('@').length !== 2)
      throw fail(
        400,
        'INVALID_EMAIL',
        `Please use a school e-mail address (ending with ${DOMAIN}).`,
      );
    if (emailTaken(email, ignoreId))
      throw fail(409, 'EMAIL_TAKEN', 'This e-mail address already belongs to an account.');
    return email;
  };
  const logFor = (user) => ({
    sessions: [
      { id: 1, startedAt: user.lastLoginAt, lastActiveAt: user.lastLoginAt, active: false },
    ],
    attempts: [],
    events: [
      { type: 'logout', detail: null, at: user.lastLoginAt, byAdmin: false },
      { type: 'login', detail: null, at: user.lastLoginAt, byAdmin: false },
    ],
  });

  // ----- admin quests (BR49-BR51): the same rules as backend/src/services/checkpoint-admin.js -----
  const invalidQuest = (message, details) => fail(400, 'INVALID_QUEST', message, details);
  const questById = (id) => {
    const quest = checkpoint(id);
    if (!quest) throw fail(404, 'NOT_FOUND', 'Quest not found.');
    return quest;
  };
  const readinessOf = (q) => {
    const types = typesOf(q.typeMode);
    const problems = [];
    const normal = poolOf(q, 'NORMAL', types).length;
    if (normal < q.questionCount)
      problems.push(
        `Needs ${q.questionCount - normal} more normal question(s); ${q.questionCount} are drawn for each attempt.`,
      );
    if (q.typeMode === 'MIXED') {
      if (poolOf(q, 'NORMAL', ['MCQ']).length < 1)
        problems.push('Needs at least one normal multiple-choice question.');
      if (poolOf(q, 'NORMAL', ['MULTI']).length < 1)
        problems.push('Needs at least one normal multi-select question.');
    }
    if (q.hardQuestionEnabled && poolOf(q, 'HARD', types).length < 1)
      problems.push(
        'The hard question is switched on but there is no hard question of the allowed types.',
      );
    return { ready: problems.length === 0, problems };
  };
  const summaryOf = (q) => ({
    id: q.id,
    name: q.name,
    description: q.description,
    mapUrl: q.mapUrl,
    lat: q.latitude,
    lng: q.longitude,
    radius: q.radius,
    graceM: GEOFENCE_SLACK_M,
    questionCount: q.questionCount,
    passThreshold: q.passThreshold,
    timeLimitSeconds: q.timeLimitSeconds,
    effectiveTimeLimitSeconds: q.timeLimitSeconds ?? q.questionCount * 60,
    hardQuestionEnabled: q.hardQuestionEnabled,
    typeMode: q.typeMode,
    isActive: q.isActive,
    archived: q.archived,
    readiness: readinessOf(q),
    counts: { questions: q.bank.length, photos: q.images.length, facts: q.facts.length },
    hasHistory: state.attempts.some((a) => a.checkpointId === q.id),
  });
  const detailOf = (q) => ({
    quest: summaryOf(q),
    facts: q.facts,
    photos: q.images.map((p, i) => ({ position: i + 1, url: p.url, alt: p.alt, credit: p.credit })),
    questions: q.bank.map((x) => ({
      id: x.id,
      difficulty: x.difficulty,
      type: x.type,
      text: x.text,
      isActive: x.isActive,
      options: x.options.map((o) => ({ ...o })),
    })),
  });
  const assertQuestRules = (q) => {
    if (q.passThreshold > q.questionCount)
      throw invalidQuest('The pass mark cannot be higher than the number of questions.');
    if (q.hardQuestionEnabled && (q.questionCount < 4 || q.passThreshold > q.questionCount - 1))
      throw invalidQuest(
        'A hard question needs at least 4 questions and a pass mark below the number of questions.',
      );
    if (q.typeMode === 'MIXED' && q.questionCount < 3)
      throw invalidQuest('Both question types need at least 3 questions.');
    const seconds = q.timeLimitSeconds;
    if (seconds !== null && (seconds < 10 * q.questionCount || seconds > 600 * q.questionCount))
      throw invalidQuest(
        `The time limit must be between ${10 * q.questionCount} and ${600 * q.questionCount} seconds for ${q.questionCount} questions.`,
      );
  };
  const readLink = (mapLink, ignoreId) => {
    const place = parseMapLink(mapLink);
    if (!place.ok) {
      const { reason, message, area } = place;
      throw fail(400, 'INVALID_MAP_LINK', message, { reason, ...(area ? { area } : {}) });
    }
    const near = state.quests.find(
      (c) =>
        !c.archived &&
        c.id !== ignoreId &&
        distance(place.lat, place.lng, c.latitude, c.longitude) < 15,
    );
    return { ...place, warnings: near ? [`Very close to the quest "${near.name}".`] : [] };
  };
  const checkName = (name, ignoreId) => {
    const clean = String(name ?? '').trim();
    if (clean.length < 2 || clean.length > 60)
      throw fail(400, 'INVALID_INPUT', 'The request is not valid.', { fields: ['name'] });
    if (state.quests.some((c) => c.id !== ignoreId && c.name.toLowerCase() === clean.toLowerCase()))
      throw fail(409, 'NAME_TAKEN', 'Another quest already uses this title.');
    return clean;
  };
  const assertOptionRules = (type, options) => {
    if (!Array.isArray(options) || options.length !== 4)
      throw fail(400, 'INVALID_INPUT', 'The request is not valid.', { fields: ['options'] });
    const right = options.filter((o) => o.isCorrect).length;
    if (type === 'MCQ' && right !== 1)
      throw invalidQuest('A multiple-choice question needs exactly one correct option.');
    if (type === 'MULTI' && (right < 2 || right > 3))
      throw invalidQuest('A multi-select question needs two or three correct options.');
    const texts = options.map((o) => String(o.text).trim().toLowerCase());
    if (new Set(texts).size !== texts.length || texts.some((t) => !t))
      throw invalidQuest('The options of a question must all be different.');
  };
  const guardActive = (q) => {
    if (q.isActive && !readinessOf(q).ready) {
      q.isActive = false;
      return true;
    }
    return false;
  };
  const used = (q, questionId) =>
    state.attempts.some((a) => a.checkpointId === q.id && a.slots.some((s) => s.id === questionId));
  const beingAnswered = (q, questionId) =>
    state.attempts.some(
      (a) =>
        a.checkpointId === q.id &&
        a.status === 'active' &&
        a.slots.some((s) => s.id === questionId),
    );

  const questAdmin = {
    async quests() {
      needAdmin();
      const sorted = [...state.quests].sort(
        (x, y) => Number(x.archived) - Number(y.archived) || x.id - y.id,
      );
      return { quests: sorted.map(summaryOf) };
    },
    async quest(id) {
      needAdmin();
      return detailOf(questById(id));
    },
    async checkLink(mapLink) {
      needAdmin();
      const { lat, lng, url, warnings } = readLink(mapLink);
      return { lat, lng, url, warnings };
    },
    async createQuest(input) {
      needAdmin();
      const q = {
        description: '',
        radius: 80,
        timeLimitSeconds: null,
        hardQuestionEnabled: false,
        typeMode: 'MCQ_ONLY',
        isActive: false,
        ...input,
      };
      q.name = checkName(q.name);
      assertQuestRules(q);
      if (q.isActive)
        throw invalidQuest('A new quest has no questions yet. Add them first, then switch it on.');
      const place = readLink(q.mapLink);
      const quest = {
        id: Math.max(0, ...state.quests.map((c) => c.id)) + 1,
        name: q.name,
        description: q.description,
        mapUrl: place.url,
        latitude: place.lat,
        longitude: place.lng,
        radius: q.radius,
        isActive: false,
        questionCount: q.questionCount,
        passThreshold: q.passThreshold,
        timeLimitSeconds: q.timeLimitSeconds,
        hardQuestionEnabled: q.hardQuestionEnabled,
        typeMode: q.typeMode,
        archived: false,
        images: [],
        facts: [],
        bank: [],
      };
      state.quests.push(quest);
      save();
      return { ...detailOf(quest), warnings: place.warnings };
    },
    async updateQuest(id, patch) {
      needAdmin();
      const quest = questById(id);
      const place = patch.mapLink === undefined ? null : readLink(patch.mapLink, quest.id);
      if (quest.archived)
        throw fail(409, 'QUEST_ARCHIVED', 'Restore the quest before changing it.');
      const next = { ...quest, ...patch };
      if (patch.name !== undefined) next.name = checkName(patch.name, quest.id);
      assertQuestRules(next);
      if (next.isActive) {
        const state2 = readinessOf(next);
        if (!state2.ready)
          throw fail(
            409,
            'QUEST_NOT_READY',
            'This quest cannot be active yet. ' + state2.problems.join(' '),
            {
              problems: state2.problems,
            },
          );
      }
      for (const key of [
        'name',
        'description',
        'radius',
        'isActive',
        'questionCount',
        'passThreshold',
        'timeLimitSeconds',
        'hardQuestionEnabled',
        'typeMode',
      ]) {
        quest[key] = next[key];
      }
      if (place)
        Object.assign(quest, { mapUrl: place.url, latitude: place.lat, longitude: place.lng });
      save();
      return { ...detailOf(quest), warnings: place?.warnings ?? [] };
    },
    async deleteQuest(id) {
      needAdmin();
      const quest = questById(id);
      if (state.attempts.some((a) => a.checkpointId === quest.id)) {
        quest.isActive = false;
        quest.archived = true;
        save();
        return { result: 'archived' };
      }
      state.quests = state.quests.filter((c) => c.id !== quest.id);
      save();
      return { result: 'erased' };
    },
    async restoreQuest(id) {
      needAdmin();
      const quest = questById(id);
      if (!quest.archived) throw fail(409, 'NOT_ARCHIVED', 'This quest is not archived.');
      quest.archived = false;
      save();
      return detailOf(quest);
    },
    async saveFacts(id, facts) {
      needAdmin();
      const quest = questById(id);
      if (
        !Array.isArray(facts) ||
        facts.length > 5 ||
        facts.some((f) => !String(f).trim() || String(f).length > 300)
      )
        throw fail(400, 'INVALID_INPUT', 'The request is not valid.', { fields: ['facts'] });
      quest.facts = facts.map((f) => String(f).trim());
      save();
      return detailOf(quest);
    },
    async addPhoto(id, file, alt, credit) {
      needAdmin();
      const quest = questById(id);
      if (!alt?.trim() || !credit?.trim())
        throw fail(400, 'INVALID_INPUT', 'The request is not valid.', {
          fields: ['alt', 'credit'],
        });
      if (!/^image\/(png|jpeg|webp)$/.test(file.type))
        throw fail(400, 'INVALID_IMAGE', 'Please upload a PNG, JPG or WebP image.');
      if (file.size > 2 * 1024 * 1024)
        throw fail(413, 'IMAGE_TOO_LARGE', 'The image is too large (limit 2 MB).');
      if (quest.images.length >= 5)
        throw fail(409, 'TOO_MANY_PHOTOS', 'A quest can have at most 5 photos.');
      const url = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      quest.images.push({ url, alt: alt.trim(), credit: credit.trim() });
      save();
      return detailOf(quest);
    },
    async updatePhoto(id, position, patch) {
      needAdmin();
      const quest = questById(id);
      const photo = quest.images[Number(position) - 1];
      if (!photo) throw fail(404, 'NOT_FOUND', 'Photo not found.');
      if (patch.alt) photo.alt = patch.alt.trim();
      if (patch.credit) photo.credit = patch.credit.trim();
      save();
      return detailOf(quest);
    },
    async deletePhoto(id, position) {
      needAdmin();
      const quest = questById(id);
      if (!quest.images[Number(position) - 1]) throw fail(404, 'NOT_FOUND', 'Photo not found.');
      quest.images.splice(Number(position) - 1, 1);
      save();
      return detailOf(quest);
    },
    async createQuestion(id, input) {
      needAdmin();
      const quest = questById(id);
      if (quest.archived)
        throw fail(409, 'QUEST_ARCHIVED', 'Restore the quest before changing it.');
      assertOptionRules(input.questionType, input.options);
      const qid = state.nextQuestionId++;
      quest.bank.push({
        id: qid,
        difficulty: input.difficulty,
        type: input.questionType,
        text: input.questionText.trim(),
        isActive: input.isActive !== false,
        options: input.options.map((o, i) => ({
          id: qid * 10 + i,
          position: i + 1,
          text: o.text.trim(),
          isCorrect: Boolean(o.isCorrect),
        })),
      });
      const deactivated = guardActive(quest);
      save();
      return { ...detailOf(quest), deactivated };
    },
    async updateQuestion(id, questionId, input) {
      needAdmin();
      const quest = questById(id);
      if (quest.archived)
        throw fail(409, 'QUEST_ARCHIVED', 'Restore the quest before changing it.');
      const question = quest.bank.find((x) => x.id === Number(questionId));
      if (!question) throw fail(404, 'NOT_FOUND', 'Question not found.');
      assertOptionRules(input.questionType, input.options);
      if (beingAnswered(quest, question.id))
        throw fail(
          409,
          'QUESTION_IN_USE',
          'A student is answering this question right now. Try again in a few minutes.',
        );
      Object.assign(question, {
        difficulty: input.difficulty,
        type: input.questionType,
        text: input.questionText.trim(),
        isActive: input.isActive !== false,
      });
      question.options.forEach((o, i) => {
        o.text = input.options[i].text.trim();
        o.isCorrect = Boolean(input.options[i].isCorrect);
      });
      const deactivated = guardActive(quest);
      save();
      return { ...detailOf(quest), deactivated };
    },
    async deleteQuestion(id, questionId) {
      needAdmin();
      const quest = questById(id);
      const question = quest.bank.find((x) => x.id === Number(questionId));
      if (!question) throw fail(404, 'NOT_FOUND', 'Question not found.');
      if (beingAnswered(quest, question.id))
        throw fail(
          409,
          'QUESTION_IN_USE',
          'A student is answering this question right now. Try again in a few minutes.',
        );
      let result = 'archived';
      if (used(quest, question.id)) question.isActive = false;
      else {
        quest.bank = quest.bank.filter((x) => x.id !== question.id);
        result = 'erased';
      }
      const deactivated = guardActive(quest);
      save();
      return { ...detailOf(quest), result, deactivated };
    },
  };

  methods.admin = {
    async stats() {
      needAdmin();
      const day = (back) => new Date(Date.now() - back * 86400e3).toISOString().slice(0, 10);
      const daily = Array.from({ length: 14 }, (_, i) => ({
        date: day(13 - i),
        logins: 6 + ((i * 7) % 11),
        attempts: 3 + ((i * 5) % 9),
        passed: 1 + ((i * 3) % 6),
      }));
      return {
        generatedAt: new Date().toISOString(),
        errors: {},
        tiles: {
          signedInNow: 3,
          activeStudents: state.admin.users.filter((u) => u.status === 'active').length,
          loginsToday: daily[13].logins,
          loginsYesterday: daily[12].logins,
          questsPassedToday: daily[13].passed,
          questsPassedYesterday: daily[12].passed,
        },
        daily,
        usersByStatus: { active: 4, blocked: 1, archived: 1 },
        checkpoints: state.quests.map((c, i) => ({
          id: c.id,
          name: c.name,
          isActive: c.isActive,
          attempts: 12 - i,
          passed: Math.max(0, 9 - i),
          passRate: (9 - i > 0 ? 9 - i : 0) / (12 - i),
        })),
        topPlayers: OTHERS.map((o, i) => ({
          rank: i + 1,
          displayName: o.displayName,
          points: o.points,
        })),
        topTeams: [{ rank: 1, name: 'Campus Crew', members: 3, points: 4100 }],
        signedIn: [
          {
            displayName: 'Mia K.',
            since: new Date(Date.now() - 50 * 60e3).toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
          {
            displayName: 'Jonas',
            since: new Date(Date.now() - 20 * 60e3).toISOString(),
            lastActiveAt: new Date().toISOString(),
          },
        ],
        recent: [
          {
            at: new Date().toISOString(),
            type: 'login',
            byAdmin: false,
            studentId: 101,
            studentName: 'Mia K.',
            checkpointName: null,
          },
          {
            at: new Date(Date.now() - 600e3).toISOString(),
            type: 'passed',
            byAdmin: false,
            studentId: 102,
            studentName: 'Jonas',
            checkpointName: 'Mensa',
          },
        ],
      };
    },
    async overview() {
      needAdmin();
      const count = (s) => state.admin.users.filter((u) => u.status === s).length;
      return {
        users: {
          active: count('active'),
          blocked: count('blocked'),
          archived: count('archived'),
        },
        admins: state.admin.users.filter((u) => u.role === 'admin').length + 1,
        activeSessions: 3,
        questsPassedToday: 11,
        loginsToday: 17,
        teams: state.admin.teams.length,
      };
    },
    async users({ q = '', status = '', role = '', noTeam = false } = {}) {
      needAdmin();
      const needle = q.toLowerCase();
      return {
        users: state.admin.users.filter(
          (u) =>
            (!noTeam || (!u.teamId && u.status === 'active' && u.role === 'student')) &&
            (!needle ||
              `${u.email} ${u.firstName} ${u.lastName} ${u.nickname}`
                .toLowerCase()
                .includes(needle)) &&
            (!role || u.role === role) &&
            (!status || (status === 'reported' ? u.reported : u.status === status)),
        ),
      };
    },
    async user(id) {
      needAdmin();
      const user = adminUser(id);
      return { user, ...logFor(user) };
    },
    async createUser({ email, firstName, lastName, nickname, role = 'student' }) {
      needAdmin();
      const clean = checkAdminEmail(email);
      if (bannedWord(`${firstName} ${lastName} ${nickname ?? ''}`, state.admin.terms))
        throw fail(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
      const user = {
        id: state.admin.nextId++,
        email: clean,
        firstName,
        lastName,
        nickname: nickname || null,
        displayName: nickname || `${firstName} ${lastName.charAt(0)}.`,
        role: role === 'admin' ? 'admin' : 'student',
        status: 'active',
        statusReason: null,
        reported: false,
        reportReason: null,
        teamId: null,
        teamName: null,
        totalPoints: 0,
        questsPassed: 0,
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      state.admin.users.unshift(user);
      save();
      return { user };
    },
    async updateUser(id, patch) {
      needAdmin();
      const user = adminUser(id);
      if (patch.email !== undefined) user.email = checkAdminEmail(patch.email, user.id);
      for (const key of ['firstName', 'lastName']) if (patch[key]) user[key] = patch[key];
      if (patch.nickname !== undefined) user.nickname = patch.nickname || null;
      if (
        bannedWord(`${user.firstName} ${user.lastName} ${user.nickname ?? ''}`, state.admin.terms)
      )
        throw fail(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
      save();
      return { user };
    },
    async setStatus(id, status, reason) {
      needAdmin();
      const user = adminUser(id);
      user.status = status;
      user.statusReason = status === 'active' ? null : (reason ?? null);
      save();
      return { user };
    },
    async report(id, reason) {
      needAdmin();
      const user = adminUser(id);
      user.reported = true;
      user.reportReason = reason;
      save();
      return { user };
    },
    async clearReport(id) {
      needAdmin();
      const user = adminUser(id);
      user.reported = false;
      user.reportReason = null;
      save();
      return { user };
    },
    async forceLogout(id) {
      needAdmin();
      adminUser(id);
      return null;
    },
    // BR47: an admin delete removes the account for good, so it appears nowhere any more.
    async deleteUser(id) {
      needAdmin();
      const user = adminUser(id);
      if (user.role === 'admin')
        throw fail(403, 'FORBIDDEN', 'Administrator accounts cannot be deleted.');
      state.admin.users = state.admin.users.filter((u) => u.id !== user.id);
      for (const team of state.admin.teams)
        team.members = team.members.filter((m) => m !== user.id);
      state.admin.teams = state.admin.teams.filter((team) => team.members.length > 0);
      save();
      return null;
    },
    // BR53: students and admins change places; an admin is in no team and starts with no points.
    async setRole(id, role) {
      needAdmin();
      if (!['student', 'admin'].includes(role)) throw fail(400, 'INVALID_INPUT', 'Unknown role.');
      const user = adminUser(id);
      if (user.role !== role) {
        user.role = role;
        user.teamId = null;
        user.teamName = null;
        user.totalPoints = 0;
        user.questsPassed = 0;
        for (const team of state.admin.teams)
          team.members = team.members.filter((m) => m !== user.id);
        state.admin.teams = state.admin.teams.filter((team) => team.members.length > 0);
        save();
      }
      return { user };
    },
    async addTeamMember(teamId, studentId) {
      needAdmin();
      const team = state.admin.teams.find((t) => t.id === Number(teamId));
      if (!team) throw fail(404, 'NOT_FOUND', 'Team not found.');
      const user = adminUser(studentId);
      if (user.role !== 'student')
        throw fail(409, 'NOT_A_STUDENT', 'Administrator accounts are not added to teams.');
      if (user.status !== 'active')
        throw fail(
          409,
          'STUDENT_NOT_ACTIVE',
          `This account is ${user.status} and cannot join a team.`,
        );
      if (user.teamId) throw fail(409, 'ALREADY_IN_TEAM', 'This student is already in a team.');
      if (team.members.length >= 5)
        throw fail(409, 'TEAM_FULL', `${team.name} already has 5 members.`);
      team.members.push(user.id);
      user.teamId = team.id;
      user.teamName = team.name;
      save();
      return null;
    },
    async teams() {
      needAdmin();
      return {
        teams: state.admin.teams.map((t) => ({
          id: t.id,
          name: t.name,
          score: t.score,
          size: t.members.length,
          createdAt: new Date().toISOString(),
          members: t.members.map((m) => ({ id: m, displayName: adminUser(m).displayName })),
        })),
      };
    },
    async renameTeam(id, name) {
      needAdmin();
      if (bannedWord(name, state.admin.terms))
        throw fail(400, 'NAME_NOT_ALLOWED', 'Please choose a different name.');
      state.admin.teams.find((t) => t.id === Number(id)).name = name;
      save();
      return null;
    },
    async removeMember(teamId, studentId) {
      needAdmin();
      const team = state.admin.teams.find((t) => t.id === Number(teamId));
      team.members = team.members.filter((m) => m !== Number(studentId));
      const user = adminUser(studentId);
      user.teamId = null;
      user.teamName = null;
      save();
      return null;
    },
    async deleteTeam(id) {
      needAdmin();
      state.admin.teams = state.admin.teams.filter((t) => t.id !== Number(id));
      save();
      return null;
    },
    ...questAdmin,
    async names() {
      needAdmin();
      return {
        builtIn: { substring: BANNED_SUBSTRING, token: BANNED_TOKEN },
        custom: state.admin.terms.map((term) => ({ term, mode: 'token' })),
      };
    },
    async addTerm(term) {
      needAdmin();
      if (!state.admin.terms.includes(term)) state.admin.terms.push(term.toLowerCase());
      save();
      return null;
    },
    async removeTerm(term) {
      needAdmin();
      state.admin.terms = state.admin.terms.filter((x) => x !== term);
      save();
      return null;
    },
    async testName(text) {
      needAdmin();
      return { blockedBy: bannedWord(text, state.admin.terms) };
    },
  };

  /** Every method answers after a short delay and returns a copy, like a real network call. */
  const wrap = (group) =>
    new Proxy(group, {
      get(target, name) {
        const entry = target[name];
        if (entry && typeof entry === 'object') return wrap(entry);
        if (typeof entry !== 'function') return undefined;
        return async (...args) => {
          await wait();
          return copy(await entry(...args));
        };
      },
    });
  return wrap(methods);
}
