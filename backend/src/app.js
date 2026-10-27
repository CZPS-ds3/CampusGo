import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { z } from 'zod';
import { SESSION_COOKIE, requireAuth, sessionCookieOptions } from './middleware/auth.js';
import { AppError, errorHandler, handle, notFound } from './middleware/errors.js';
import { createLimiters } from './middleware/rate-limit.js';
import { GENERIC_OTP_MESSAGE, createAuthService, publicStudent } from './services/auth.js';
import { createLeaderboardService } from './services/leaderboards.js';
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
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(100000),
  }),
  startAttempt: z.object({ checkpointId: id }),
  answer: z.object({ optionId: id, questionNumber: z.number().int().min(1).max(5).optional() }),
  team: z.object({ name: z.string().trim().min(2).max(30) }),
  invite: z.object({ email }),
};

/**
 * Builds the Express app. Everything that touches the outside world (database pool, mailer, clock)
 * is passed in so that tests can replace it.
 */
export function createApp({ pool, config, mailer, clock }) {
  const app = express();
  const auth = createAuthService({ pool, config, mailer, clock });
  const quiz = createQuizService({ pool, config, clock });
  const teams = createTeamService({ pool, config, clock });
  const boards = createLeaderboardService({ pool });
  const limits = createLimiters(config);
  const needLogin = requireAuth(auth);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxProfilePictureBytes, files: 1 },
  });
  const uploadDir = resolve(config.uploadDir);

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
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
  if (config.isDev) {
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
      const rank = await boards.rankOf(req.student.total_points);
      res.json({ student: { ...publicStudent(req.student), rank } });
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

  // ----- checkpoints and attempts (BR07-BR25) -----
  api.get(
    '/checkpoints',
    handle(async (req, res) =>
      res.json({ checkpoints: await quiz.listCheckpoints(req.student.student_id) }),
    ),
  );
  api.post(
    '/checkpoints/:id/location-check',
    limits.location,
    handle(async (req, res) => {
      const outcome = await quiz.locationCheck(
        req.student.student_id,
        id.parse(req.params.id),
        schemas.location.parse(req.body),
      );
      res.json({ outcome });
    }),
  );
  api.post(
    '/attempts',
    handle(async (req, res) => {
      const body = schemas.startAttempt.parse(req.body);
      res
        .status(201)
        .json({ attempt: await quiz.startAttempt(req.student.student_id, body.checkpointId) });
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
      await teams.invite(req.student.student_id, body.email);
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

  // ----- leaderboards (BR04, BR24) -----
  api.get(
    '/leaderboards/solo',
    handle(async (req, res) => res.json(await boards.solo(req.student.student_id))),
  );
  api.get(
    '/leaderboards/team',
    handle(async (req, res) => res.json(await boards.team(req.student.student_id))),
  );

  api.use((_req, _res, next) => next(notFound('Unknown endpoint.')));
  app.use('/api', api);
  app.use(errorHandler(config));

  return { app, services: { auth, quiz, teams, boards } };
}
