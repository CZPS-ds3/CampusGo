import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';
import { requireAdmin } from './middleware/admin.js';
import { SESSION_COOKIE, requireAuth, sessionCookieOptions } from './middleware/auth.js';
import { AppError, errorHandler, handle, notFound } from './middleware/errors.js';
import { createLimiters } from './middleware/rate-limit.js';
import { requireSameOrigin } from './middleware/same-origin.js';
import { createAccountService } from './services/account.js';
import { createAdminService } from './services/admin.js';
import { createCheckpointAdminService, questSchemas } from './services/checkpoint-admin.js';
import { GENERIC_OTP_MESSAGE, createAuthService, publicStudent } from './services/auth.js';
import { createLeaderboardService } from './services/leaderboards.js';
import { createNameRules } from './services/name-rules.js';
import { createMapStyleService } from './services/map-style.js';
import { createPlayerService } from './services/players.js';
import { storeProfilePicture } from './services/pictures.js';
import { createQuizService } from './services/quiz.js';
import { GENERIC_INVITE_MESSAGE, createTeamService } from './services/teams.js';

const name = z.string().trim().min(1).max(50);
const email = z.string().max(320);
const id = z.coerce.number().int().positive();
const schemas = {
  requestOtp: z.object({ email }),
  verify: z.object({
    email,
    otp: z.string().max(12),
    firstName: name.optional(),
    lastName: name.optional(),
    nickname: z.string().trim().max(20).optional(),
    avatarPreset: z.number().int().min(0).max(5).optional(),
  }),
  // One location reading (Main Project Document 6.2). Never logged or stored.
  reading: z.object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(100000),
    ageMs: z
      .number()
      .finite()
      .max(24 * 3600 * 1000),
  }),
  // One option (MCQ) as `optionId`, or the ticked options of a multi-select as `optionIds` (BR50).
  answer: z
    .object({
      optionId: id.optional(),
      optionIds: z.array(id).min(1).max(6).optional(),
      questionNumber: z.number().int().min(1).max(10).optional(),
    })
    .refine((body) => body.optionId !== undefined || body.optionIds !== undefined, {
      message: 'Choose at least one option.',
    }),
  team: z.object({ name: z.string().trim().min(2).max(30) }),
  invite: z
    .object({ email: email.optional(), playerId: id.optional() })
    .refine((body) => Boolean(body.email) !== Boolean(body.playerId)),
  adminUsers: z.object({
    q: z.string().trim().max(80).optional(),
    status: z.enum(['active', 'blocked', 'archived', 'deleted', 'reported']).optional(),
    noTeam: z.enum(['1']).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  }),
  adminCreate: z.object({
    email,
    firstName: name,
    lastName: name,
    nickname: z.string().trim().max(20).optional(),
  }),
  adminPatch: z.object({
    email: email.optional(),
    firstName: name.optional(),
    lastName: name.optional(),
    nickname: z.string().trim().max(20).optional(),
  }),
  adminStatus: z.object({
    status: z.enum(['active', 'blocked', 'archived']),
    reason: z.string().trim().max(200).optional(),
  }),
  adminReport: z.object({ reason: z.string().trim().min(1).max(200) }),
  adminTerm: z.object({
    term: z.string().trim().toLowerCase().min(2).max(60),
    mode: z.enum(['substring', 'token']),
  }),
  adminTest: z.object({ text: z.string().max(200) }),
};

/**
 * Builds the Express app. Everything that touches the outside world (database pool, mailer, clock)
 * is passed in so that tests can replace it.
 */
export function createApp({ pool, config, mailer, clock, fetchImpl }) {
  const app = express();
  const nameRules = createNameRules({ pool });
  const auth = createAuthService({ pool, config, mailer, clock, nameRules });
  const quiz = createQuizService({ pool, config, clock });
  const teams = createTeamService({ pool, config, clock, nameRules });
  const accounts = createAccountService({ pool, clock });
  const admin = createAdminService({ pool, config, clock, nameRules });
  const boards = createLeaderboardService({ pool });
  const quests = createCheckpointAdminService({
    pool,
    config,
    clock,
    uploadDir: resolve(config.uploadDir),
    fetchImpl,
  });
  const players = createPlayerService({ pool, clock, boards });
  const mapStyles = createMapStyleService({ pool });
  const limits = createLimiters(config);
  const needLogin = requireAuth(auth);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxProfilePictureBytes, files: 1 },
  });
  const uploadDir = resolve(config.uploadDir);

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use(requireSameOrigin(config.frontendOrigin));
  app.use('/uploads', express.static(uploadDir, { maxAge: '1h', index: false }));

  const api = express.Router();
  api.use(limits.general);
  api.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // ----- auth (BR01-BR03) -----
  api.post(
    '/auth/request-otp',
    limits.auth,
    handle(async (req, res) => {
      const body = schemas.requestOtp.parse(req.body);
      await auth.requestOtp(body.email);
      res.json({ message: GENERIC_OTP_MESSAGE });
    }),
  );
  api.post(
    '/auth/verify',
    limits.auth,
    handle(async (req, res) => {
      const body = schemas.verify.parse(req.body);
      const result = await auth.verifyOtp(body.email, body.otp, {
        firstName: body.firstName,
        lastName: body.lastName,
        nickname: body.nickname || null,
        avatarPreset: body.avatarPreset,
      });
      if (result.status === 'profile_required') return res.json({ status: 'profile_required' });
      res.cookie(SESSION_COOKIE, result.token, sessionCookieOptions(config));
      res.status(result.created ? 201 : 200).json({ status: 'ok', student: result.student });
    }),
  );
  api.post(
    '/auth/logout',
    handle(async (req, res) => {
      await auth.logout(req.cookies?.[SESSION_COOKIE]);
      res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(config), maxAge: undefined });
      res.status(204).end();
    }),
  );
  // Development only, and only while no real SMTP server is configured (codes are then kept in memory).
  if (config.isDev && !config.smtp.host) {
    api.get('/dev/last-otp', (req, res) => {
      const mail = mailer.lastTo?.(
        String(req.query.email ?? '')
          .trim()
          .toLowerCase(),
      );
      const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
      if (!code) throw notFound('No code sent yet.');
      res.json({ otp: code });
    });
  }

  // ----- everything below needs a session -----
  api.use(needLogin);

  api.get(
    '/me',
    handle(async (req, res) => {
      const rank =
        req.student.role === 'admin' ? null : await boards.rankOf(req.student.total_points);
      res.json({ student: { ...publicStudent(req.student), rank } });
    }),
  );
  api.post(
    '/me/reset-points',
    handle(async (req, res) => {
      await accounts.resetTestPoints(req.student.student_id);
      res.json({ totalPoints: 0 });
    }),
  );
  api.delete(
    '/me',
    handle(async (req, res) => {
      if (req.student.role === 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'Administrator accounts cannot be deleted here.');
      }
      await accounts.deleteAccount(req.student.student_id, { bySelf: true });
      res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions(config), maxAge: undefined });
      res.status(204).end();
    }),
  );
  api.post(
    '/me/avatar-preset',
    handle(async (req, res) => {
      const { preset } = z.object({ preset: z.number().int().min(0).max(5) }).parse(req.body);
      await pool.query(
        'UPDATE students SET avatar_preset = ?, profile_picture = NULL WHERE student_id = ?',
        [preset, req.student.student_id],
      );
      res.status(204).end();
    }),
  );
  api.post(
    '/me/picture',
    upload.single('file'),
    handle(async (req, res) => {
      if (!req.file) throw new AppError(400, 'INVALID_IMAGE', 'Please choose an image.');
      const pictureUrl = await storeProfilePicture(req.file.buffer, uploadDir);
      await pool.query('UPDATE students SET profile_picture = ? WHERE student_id = ?', [
        pictureUrl,
        req.student.student_id,
      ]);
      res.json({ pictureUrl });
    }),
  );
  api.post(
    '/me/location-consent',
    handle(async (req, res) => {
      await pool.query(
        'UPDATE students SET location_consent_at = COALESCE(location_consent_at, ?) WHERE student_id = ?',
        [new Date(clock.now()), req.student.student_id],
      );
      res.status(204).end();
    }),
  );

  // ----- map style: one per account (BR48) -----
  api.get(
    '/me/map-style',
    handle(async (req, res) => res.json({ style: await mapStyles.get(req.student.student_id) })),
  );
  api.put(
    '/me/map-style',
    handle(async (req, res) =>
      res.json({ style: await mapStyles.save(req.student.student_id, req.body) }),
    ),
  );
  api.delete(
    '/me/map-style',
    handle(async (req, res) => res.json({ style: await mapStyles.reset(req.student.student_id) })),
  );

  // ----- checkpoints and attempts (BR07-BR25) -----
  api.get(
    '/checkpoints',
    handle(async (req, res) =>
      res.json({ checkpoints: await quiz.listCheckpoints(req.student.student_id) }),
    ),
  );
  // Geofence check and unlock in one call (Main Project Document 6.2, Figure 3).
  api.post(
    '/checkpoints/:id/verify',
    limits.verify,
    handle(async (req, res) => {
      res.json(
        await quiz.verifyAndStart(
          req.student.student_id,
          id.parse(req.params.id),
          schemas.reading.parse(req.body),
        ),
      );
    }),
  );
  api.get(
    '/attempts/active',
    handle(async (req, res) =>
      res.json({ attempt: await quiz.getActiveAttempt(req.student.student_id) }),
    ),
  );
  api.get(
    '/attempts/:id',
    handle(async (req, res) =>
      res.json({ attempt: await quiz.getAttempt(req.student.student_id, id.parse(req.params.id)) }),
    ),
  );
  api.post(
    '/attempts/:id/answers',
    handle(async (req, res) => {
      const body = schemas.answer.parse(req.body);
      res.json(
        await quiz.answer(
          req.student.student_id,
          id.parse(req.params.id),
          body.optionId,
          body.questionNumber,
          body.optionIds,
        ),
      );
    }),
  );
  api.post(
    '/attempts/:id/hard',
    handle(async (req, res) =>
      res.json({ attempt: await quiz.acceptHard(req.student.student_id, id.parse(req.params.id)) }),
    ),
  );
  api.get(
    '/attempts/:id/result',
    handle(async (req, res) =>
      res.json({ result: await quiz.getResult(req.student.student_id, id.parse(req.params.id)) }),
    ),
  );

  // ----- teams (BR05, BR06) -----
  api.get(
    '/teams/me',
    handle(async (req, res) => res.json({ team: await teams.getMyTeam(req.student.student_id) })),
  );
  api.post(
    '/teams',
    handle(async (req, res) => {
      const body = schemas.team.parse(req.body);
      res.status(201).json({ team: await teams.createTeam(req.student.student_id, body.name) });
    }),
  );
  api.post(
    '/teams/me/picture',
    upload.single('file'),
    handle(async (req, res) => {
      if (!req.file) throw new AppError(400, 'INVALID_IMAGE', 'Please choose an image.');
      const pictureUrl = await storeProfilePicture(req.file.buffer, uploadDir);
      await teams.setTeamPicture(req.student.student_id, pictureUrl);
      res.json({ pictureUrl });
    }),
  );
  api.post(
    '/teams/me/invitations',
    handle(async (req, res) => {
      const body = schemas.invite.parse(req.body);
      if (body.playerId) await teams.invitePlayer(req.student.student_id, body.playerId);
      else await teams.invite(req.student.student_id, body.email);
      res.status(202).json({ message: GENERIC_INVITE_MESSAGE });
    }),
  );
  api.get(
    '/invitations',
    handle(async (req, res) =>
      res.json({ invitations: await teams.listInvitations(req.student.student_id) }),
    ),
  );
  api.post(
    '/invitations/:id/accept',
    handle(async (req, res) =>
      res.json({ team: await teams.accept(req.student.student_id, id.parse(req.params.id)) }),
    ),
  );
  api.post(
    '/invitations/:id/reject',
    handle(async (req, res) => {
      await teams.reject(req.student.student_id, id.parse(req.params.id));
      res.status(204).end();
    }),
  );

  api.delete(
    '/teams/me/members/:studentId',
    handle(async (req, res) =>
      res.json({
        team: await teams.removeMember(req.student.student_id, id.parse(req.params.studentId)),
      }),
    ),
  );
  api.post(
    '/teams/me/invitations/:id/cancel',
    handle(async (req, res) =>
      res.json({
        team: await teams.cancelInvitation(req.student.student_id, id.parse(req.params.id)),
      }),
    ),
  );

  // ----- player profiles -----
  api.get(
    '/players/:id',
    handle(async (req, res) =>
      res.json(await players.getPlayer(req.student.student_id, id.parse(req.params.id))),
    ),
  );

  // ----- leaderboards (BR04, BR24) -----
  api.get(
    '/leaderboards/solo',
    handle(async (req, res) => res.json(await boards.solo(req.student.student_id))),
  );
  api.get(
    '/leaderboards/team',
    handle(async (req, res) => res.json(await boards.team(req.student.student_id))),
  );

  // ----- admin area (needs the admin role) -----
  const adminApi = express.Router();
  adminApi.use(requireAdmin);
  const actor = (req) => req.student.student_id;
  adminApi.get(
    '/stats',
    handle(async (_req, res) => {
      res.set('Cache-Control', 'private, no-store');
      res.json(await admin.stats());
    }),
  );
  adminApi.get(
    '/overview',
    handle(async (_req, res) => res.json(await admin.overview())),
  );
  adminApi.get(
    '/users',
    handle(async (req, res) =>
      res.json({ users: await admin.listUsers(schemas.adminUsers.parse(req.query)) }),
    ),
  );
  adminApi.post(
    '/users',
    handle(async (req, res) =>
      res
        .status(201)
        .json({ user: await admin.createUser(actor(req), schemas.adminCreate.parse(req.body)) }),
    ),
  );
  adminApi.get(
    '/users/:id',
    handle(async (req, res) => res.json(await admin.getUser(id.parse(req.params.id)))),
  );
  adminApi.patch(
    '/users/:id',
    handle(async (req, res) =>
      res.json({
        user: await admin.updateUser(
          actor(req),
          id.parse(req.params.id),
          schemas.adminPatch.parse(req.body),
        ),
      }),
    ),
  );
  adminApi.post(
    '/users/:id/status',
    handle(async (req, res) => {
      const body = schemas.adminStatus.parse(req.body);
      res.json({
        user: await admin.setStatus(actor(req), id.parse(req.params.id), body.status, body.reason),
      });
    }),
  );
  adminApi.post(
    '/users/:id/report',
    handle(async (req, res) => {
      const body = schemas.adminReport.parse(req.body);
      res.json({ user: await admin.report(actor(req), id.parse(req.params.id), body.reason) });
    }),
  );
  adminApi.delete(
    '/users/:id/report',
    handle(async (req, res) =>
      res.json({ user: await admin.clearReport(actor(req), id.parse(req.params.id)) }),
    ),
  );
  adminApi.post(
    '/users/:id/logout',
    handle(async (req, res) => {
      await admin.forceLogout(actor(req), id.parse(req.params.id));
      res.status(204).end();
    }),
  );
  adminApi.post(
    '/users/:id/restore',
    handle(async (req, res) =>
      res.json({ user: await admin.restoreUser(actor(req), id.parse(req.params.id)) }),
    ),
  );
  adminApi.delete(
    '/users/:id/permanent',
    handle(async (req, res) => {
      await admin.purgeUser(actor(req), id.parse(req.params.id));
      res.status(204).end();
    }),
  );
  adminApi.post(
    '/teams/:id/members',
    handle(async (req, res) => {
      const body = z.object({ studentId: id }).parse(req.body);
      await admin.addTeamMember(actor(req), id.parse(req.params.id), body.studentId);
      res.status(204).end();
    }),
  );
  adminApi.delete(
    '/users/:id',
    handle(async (req, res) => {
      await admin.deleteUser(actor(req), id.parse(req.params.id));
      res.status(204).end();
    }),
  );
  // ----- quests: checkpoints, photos, information and questions (BR49-BR51) -----
  adminApi.get(
    '/checkpoints',
    handle(async (_req, res) => res.json({ quests: await quests.list() })),
  );
  adminApi.post(
    '/checkpoints/check-link',
    handle(async (req, res) =>
      res.json(await quests.checkLink(questSchemas.link.parse(req.body).mapLink)),
    ),
  );
  adminApi.post(
    '/checkpoints',
    handle(async (req, res) =>
      res.status(201).json(await quests.create(actor(req), questSchemas.create.parse(req.body))),
    ),
  );
  adminApi.get(
    '/checkpoints/:id',
    handle(async (req, res) => res.json(await quests.get(id.parse(req.params.id)))),
  );
  adminApi.patch(
    '/checkpoints/:id',
    handle(async (req, res) =>
      res.json(
        await quests.update(
          actor(req),
          id.parse(req.params.id),
          questSchemas.update.parse(req.body),
        ),
      ),
    ),
  );
  adminApi.delete(
    '/checkpoints/:id',
    handle(async (req, res) => res.json(await quests.remove(actor(req), id.parse(req.params.id)))),
  );
  adminApi.post(
    '/checkpoints/:id/restore',
    handle(async (req, res) => res.json(await quests.restore(actor(req), id.parse(req.params.id)))),
  );
  adminApi.put(
    '/checkpoints/:id/facts',
    handle(async (req, res) =>
      res.json(
        await quests.setFacts(
          actor(req),
          id.parse(req.params.id),
          questSchemas.facts.parse(req.body).facts,
        ),
      ),
    ),
  );
  adminApi.post(
    '/checkpoints/:id/photos',
    upload.single('file'),
    handle(async (req, res) => {
      if (!req.file) throw new AppError(400, 'INVALID_IMAGE', 'Choose an image to upload.');
      res
        .status(201)
        .json(
          await quests.addPhoto(
            actor(req),
            id.parse(req.params.id),
            req.file.buffer,
            questSchemas.photo.parse(req.body),
          ),
        );
    }),
  );
  adminApi.patch(
    '/checkpoints/:id/photos/:position',
    handle(async (req, res) =>
      res.json(
        await quests.updatePhoto(
          actor(req),
          id.parse(req.params.id),
          id.parse(req.params.position),
          questSchemas.photoText.parse(req.body),
        ),
      ),
    ),
  );
  adminApi.delete(
    '/checkpoints/:id/photos/:position',
    handle(async (req, res) =>
      res.json(
        await quests.removePhoto(
          actor(req),
          id.parse(req.params.id),
          id.parse(req.params.position),
        ),
      ),
    ),
  );
  adminApi.post(
    '/checkpoints/:id/questions',
    handle(async (req, res) =>
      res
        .status(201)
        .json(
          await quests.createQuestion(
            actor(req),
            id.parse(req.params.id),
            questSchemas.question.parse(req.body),
          ),
        ),
    ),
  );
  adminApi.put(
    '/checkpoints/:id/questions/:questionId',
    handle(async (req, res) =>
      res.json(
        await quests.updateQuestion(
          actor(req),
          id.parse(req.params.id),
          id.parse(req.params.questionId),
          questSchemas.question.parse(req.body),
        ),
      ),
    ),
  );
  adminApi.delete(
    '/checkpoints/:id/questions/:questionId',
    handle(async (req, res) =>
      res.json(
        await quests.deleteQuestion(
          actor(req),
          id.parse(req.params.id),
          id.parse(req.params.questionId),
        ),
      ),
    ),
  );
  adminApi.get(
    '/teams',
    handle(async (_req, res) => res.json({ teams: await admin.listTeams() })),
  );
  adminApi.patch(
    '/teams/:id',
    handle(async (req, res) => {
      await admin.renameTeam(
        actor(req),
        id.parse(req.params.id),
        schemas.team.parse(req.body).name,
      );
      res.status(204).end();
    }),
  );
  adminApi.delete(
    '/teams/:id/members/:studentId',
    handle(async (req, res) => {
      await admin.removeMember(actor(req), id.parse(req.params.id), id.parse(req.params.studentId));
      res.status(204).end();
    }),
  );
  adminApi.delete(
    '/teams/:id',
    handle(async (req, res) => {
      await admin.deleteTeam(actor(req), id.parse(req.params.id));
      res.status(204).end();
    }),
  );
  adminApi.get(
    '/names',
    handle(async (_req, res) => res.json(await admin.listTerms())),
  );
  adminApi.post(
    '/names',
    handle(async (req, res) => {
      const body = schemas.adminTerm.parse(req.body);
      await admin.addTerm(actor(req), body.term, body.mode);
      res.status(204).end();
    }),
  );
  adminApi.delete(
    '/names/:term',
    handle(async (req, res) => {
      await admin.removeTerm(actor(req), String(req.params.term).toLowerCase());
      res.status(204).end();
    }),
  );
  adminApi.post(
    '/names/test',
    handle(async (req, res) =>
      res.json(await admin.testName(schemas.adminTest.parse(req.body).text)),
    ),
  );
  api.use('/admin', adminApi);

  api.use((_req, _res, next) => next(notFound('Unknown endpoint.')));
  app.use('/api', api);
  app.use(errorHandler(config));

  return { app, services: { auth, quiz, teams, boards, admin, accounts } };
}
