// In-browser stand-in for the backend (npm run dev:mock, e2e tests). Same shapes and rules as the real API,
// kept deliberately small: the real rules live in backend/. State survives a page refresh (sessionStorage).

import places from './places.json';

const STORAGE_KEY = 'cq-mock-v2';
const SECOND = 1000;
const OTP = '123456';
const DOMAIN = 'heilbronn.dhbw.de';
const MAX_ACCURACY_M = 100;
const GEOFENCE_SLACK_M = 25; // grace zone added to every radius
const NEARER_MARGIN_M = 20; // another checkpoint must be this much nearer to win
const MAX_POSITION_AGE_MS = 30_000;
const ADMIN_EMAIL = `sekretariat.dski@${DOMAIN}`;
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
  ['Mensa', 49.148464, 9.215808, 60, 5, 4, true, true],
  ['Library', 49.149493, 9.216467, 60, 5, 4, true, true],
  ['CAS Cafe', 49.148951, 9.216205, 40, 3, 2, false, true],
  ['Campus Garden', 49.147082, 9.217206, 50, 3, 2, false, true],
  ['Care.box and Shop.box', 49.149088, 9.21727, 40, 3, 2, false, true],
  ['Building B', 49.147126, 9.218486, 60, 5, 4, true, true],
  ['Building C', 49.147316, 9.2179, 60, 5, 4, true, true],
  ['Sensoricum', 49.14762, 9.217807, 40, 3, 2, false, true],
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
  const checkpoint = (id) => CHECKPOINTS.find((c) => c.id === Number(id));

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

  const slotsFor = (cp, seed) => {
    const picked = [];
    for (let n = 0; n < cp.questionCount; n += 1) {
      const qid = cp.id * 100 + ((seed + n) % 10) + 1;
      picked.push(makeQuestion(cp, qid, 'NORMAL', n));
    }
    return picked.map((q, i) => ({ ...q, number: i + 1, selected: null, replaced: false }));
  };
  const makeQuestion = (cp, qid, difficulty, n) => {
    const correct = (qid + n) % 4;
    return {
      id: qid,
      difficulty,
      text: `Practice question ${qid % 100} about ${cp.name}?`,
      options: [0, 1, 2, 3].map((p) => ({
        id: qid * 10 + p,
        position: p + 1,
        text: `Option ${'ABCD'[p]}${p === correct ? ' (placeholder answer)' : ''}`,
        correct: p === correct,
      })),
    };
  };

  const finalize = (attempt, reason, nowMs) => {
    const cp = checkpoint(attempt.checkpointId);
    const correctCount = attempt.slots.filter(
      (s) => s.options.find((o) => o.id === s.selected)?.correct,
    ).length;
    const passed = correctCount >= cp.passThreshold;
    const multiplier = MULTIPLIERS[Math.min(attempt.attemptNumber, 6) - 1];
    const finishedMs = reason === 'expired' ? attempt.expiresMs : nowMs;
    const remaining =
      reason === 'expired' ? 0 : Math.max(0, Math.floor((attempt.expiresMs - finishedMs) / SECOND));
    let base = 0;
    if (passed) {
      for (const s of attempt.slots) {
        if (s.options.find((o) => o.id === s.selected)?.correct)
          base += s.difficulty === 'HARD' ? 2000 : 1000;
      }
    }
    const full = passed && correctCount === cp.questionCount ? 200 : 0;
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
      questionCount: cp.questionCount,
      passThreshold: cp.passThreshold,
      hardUnlocked: a.hardUnlocked,
      hardAccepted: Boolean(a.slots[4]?.replaced),
      currentQuestion: a.status === 'active' && next ? next.number : null,
      questions: a.slots.map((s) => {
        const chosen = s.options.find((o) => o.id === s.selected);
        const wrong = s.selected !== null && !chosen?.correct;
        const q = {
          number: s.number,
          id: s.id,
          text: s.text,
          difficulty: s.difficulty,
          options: s.options.map(({ id, position, text }) => ({ id, position, text })),
          selectedOptionId: s.selected,
          answered: s.selected !== null,
        };
        if (wrong) q.correctOptionId = s.options.find((o) => o.correct).id;
        if (s.selected !== null) q.correct = !wrong;
        return q;
      }),
    };
  };

  const resultOf = (a) => {
    const cp = checkpoint(a.checkpointId);
    const used = state.attempts.filter((x) => x.checkpointId === a.checkpointId).length;
    return {
      attemptId: a.id,
      checkpointId: a.checkpointId,
      attemptNumber: a.attemptNumber,
      passed: a.status === 'passed',
      status: a.status,
      endReason: a.endReason,
      correctCount: a.correctCount,
      questionCount: cp.questionCount,
      passThreshold: cp.passThreshold,
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
      expiresMs: now + cp.questionCount * 60 * SECOND,
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
      if (!clean.endsWith(DOMAIN) || clean.split('@').length !== 2) {
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
          role: clean === ADMIN_EMAIL ? 'admin' : 'student',
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
        checkpoints: CHECKPOINTS.filter((c) => c.isActive || state.student?.role === 'admin').map(
          (c) => {
            const mine = state.attempts.filter((a) => a.checkpointId === c.id);
            return {
              ...c,
              completed: mine.some((a) => a.status === 'passed'),
              attemptsUsed: mine.length,
              nextAttemptNumber: mine.length + 1,
              bestScore: Math.max(0, ...mine.map((a) => a.pointsEarned ?? 0)),
              facts: [1, 2, 3].map((n) => `PLACEHOLDER fact ${n} about ${c.name}.`),
            };
          },
        ),
      };
    },
    async verifyLocation(id, { latitude, longitude, accuracy, ageMs }) {
      needLogin();
      sweep();
      const cp = checkpoint(id);
      // Administrators test any quiz from anywhere, as often as they like.
      const testMode = state.student?.role === 'admin';
      if (!cp || (!cp.isActive && !testMode))
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
      if (metres > cp.radius + GEOFENCE_SLACK_M) {
        return {
          status: 'OUTSIDE',
          distanceM,
          elsewhere: null,
          message: `You are about ${distanceM} m from ${cp.name}. Walk closer and try again.`,
        };
      }
      // Overlapping circles: a reading belongs to the checkpoint with the nearest centre only.
      const nearer = CHECKPOINTS.filter((c) => c.isActive && c.id !== cp.id)
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
    async answer(id, optionId) {
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
      const option = slot.options.find((o) => o.id === optionId);
      if (!option)
        throw fail(400, 'INVALID_OPTION', 'That option does not belong to this question.');
      slot.selected = optionId;
      const cp = checkpoint(a.checkpointId);
      if (slot.number === 4 && a.attemptNumber === 1 && cp.hardQuestionEnabled) {
        a.hardUnlocked = a.slots
          .slice(0, 4)
          .every((s) => s.options.find((o) => o.id === s.selected)?.correct);
      }
      const last = a.slots.every((s) => s.selected !== null);
      if (last) finalize(a, 'completed', Date.now());
      save();
      const response = { correct: option.correct, attempt: view(a) };
      if (!option.correct) response.correctOptionId = slot.options.find((o) => o.correct).id;
      if (last) response.result = resultOf(a);
      return response;
    },
    async acceptHard(id) {
      needLogin();
      const a = ownAttempt(id);
      const slot = a.slots[4];
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
      const hard = makeQuestion(cp, cp.id * 100 + 90, 'HARD', 4);
      a.slots[4] = { ...hard, number: 5, selected: null, replaced: true };
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
        usersByStatus: { active: 4, blocked: 1, archived: 1, deleted: 0 },
        checkpoints: CHECKPOINTS.map((c, i) => ({
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
          deleted: count('deleted'),
        },
        activeSessions: 3,
        questsPassedToday: 11,
        loginsToday: 17,
        teams: state.admin.teams.length,
      };
    },
    async users({ q = '', status = '' } = {}) {
      needAdmin();
      const needle = q.toLowerCase();
      return {
        users: state.admin.users.filter(
          (u) =>
            (!needle ||
              `${u.email} ${u.firstName} ${u.lastName} ${u.nickname}`
                .toLowerCase()
                .includes(needle)) &&
            (!status || (status === 'reported' ? u.reported : u.status === status)),
        ),
      };
    },
    async user(id) {
      needAdmin();
      const user = adminUser(id);
      return { user, ...logFor(user) };
    },
    async createUser({ email, firstName, lastName, nickname }) {
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
        role: 'student',
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
    async deleteUser(id) {
      needAdmin();
      const user = adminUser(id);
      user.status = 'deleted';
      user.email = `deleted-${user.id}@deleted.invalid`;
      user.firstName = 'Deleted';
      user.lastName = 'User';
      user.nickname = null;
      user.teamName = null;
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
      save();
      return null;
    },
    async deleteTeam(id) {
      needAdmin();
      state.admin.teams = state.admin.teams.filter((t) => t.id !== Number(id));
      save();
      return null;
    },
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
