// In-browser stand-in for the backend (npm run dev:mock, e2e tests). Same shapes and rules as the real API,
// kept deliberately small: the real rules live in backend/. State survives a page refresh (sessionStorage).

const STORAGE_KEY = 'cq-mock-v1';
const SECOND = 1000;
const OTP = '123456';
const DOMAIN = 'heilbronn.dhbw.de';
const MAX_ACCURACY_M = 50;

const CHECKPOINTS = [
  ['Mensa', 49.1231, 9.2108, 5, 4, true],
  ['Library', 49.1236, 9.2119, 5, 4, true],
  ['CAS Cafe', 49.1228, 9.2102, 3, 2, false],
  ['Campus Garden', 49.1224, 9.2114, 3, 2, false],
  ['Care.box and Shop.box', 49.1233, 9.2096, 3, 2, false],
  ['Building B', 49.1239, 9.2106, 5, 4, true],
  ['Building C', 49.1241, 9.2115, 5, 4, true],
  ['Containers', 49.1221, 9.2121, 3, 2, false],
].map(([name, latitude, longitude, questionCount, passThreshold, hard], i) => ({
  id: i + 1,
  name,
  latitude,
  longitude,
  radius: 60,
  isActive: true,
  questionCount,
  passThreshold,
  hardQuestionEnabled: hard,
}));

const MULTIPLIERS = [100, 85, 70, 55, 40, 0];
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
  checks: [],
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
    rank: rankFor(totalPoints()),
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
      rankBefore: rankFor(Math.ceil(Math.max(0, totalExact() - (a.pointsExact ?? 0)) / 100)),
      rankAfter: rankFor(totalPoints()),
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
        state.student = {
          id: 1,
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
        checkpoints: CHECKPOINTS.map((c) => {
          const mine = state.attempts.filter((a) => a.checkpointId === c.id);
          return {
            ...c,
            completed: mine.some((a) => a.status === 'passed'),
            attemptsUsed: mine.length,
            nextAttemptNumber: mine.length + 1,
            bestScore: Math.max(0, ...mine.map((a) => a.pointsEarned ?? 0)),
            facts: [1, 2, 3].map((n) => `PLACEHOLDER fact ${n} about ${c.name}.`),
          };
        }),
      };
    },
    async locationCheck(id, { latitude, longitude, accuracy }) {
      needLogin();
      sweep();
      const cp = checkpoint(id);
      if (!cp) throw fail(404, 'NOT_FOUND', 'Checkpoint not found.');
      if (!state.consent)
        throw fail(403, 'CONSENT_REQUIRED', 'Please accept the location notice first.');
      if (state.attempts.some((a) => a.checkpointId === cp.id && a.status === 'passed')) {
        throw fail(409, 'CHECKPOINT_COMPLETED', 'You already completed this checkpoint.');
      }
      const active = activeAttempt();
      if (active)
        throw fail(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
          attemptId: active.id,
        });
      if (accuracy > MAX_ACCURACY_M) return { outcome: 'poor_accuracy' };
      const inside = distance(latitude, longitude, cp.latitude, cp.longitude) <= cp.radius;
      if (inside) state.checks.push({ checkpointId: cp.id, at: Date.now(), used: false });
      save();
      return { outcome: inside ? 'verified' : 'outside_radius' };
    },
    async startAttempt(checkpointId) {
      needLogin();
      sweep();
      const cp = checkpoint(checkpointId);
      const active = activeAttempt();
      if (active)
        throw fail(409, 'ACTIVE_ATTEMPT_EXISTS', 'You have a quiz in progress.', {
          attemptId: active.id,
        });
      const check = state.checks.find(
        (c) => c.checkpointId === cp.id && !c.used && Date.now() - c.at <= 5 * 60 * 1000,
      );
      if (!check) throw fail(409, 'LOCATION_NOT_VERIFIED', 'Please check your location first.');
      check.used = true;
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
      return { attempt: view(attempt) };
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
      if (taken < 5) {
        state.team.pending = [
          ...(state.team.pending ?? []),
          { expiresAt: new Date(Date.now() + 24 * 3600e3).toISOString() },
        ];
        save();
      }
      return { message: 'If the user exists and can be invited, an invitation has been sent.' };
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
      const entries = mine.active
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

  return new Proxy(methods, {
    get(target, name) {
      const fn = target[name];
      if (typeof fn !== 'function') return undefined;
      return async (...args) => {
        await wait();
        return copy(await fn(...args));
      };
    },
  });
}
