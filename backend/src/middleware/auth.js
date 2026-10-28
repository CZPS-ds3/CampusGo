import { AppError, handle } from './errors.js';

export const SESSION_COOKIE = 'cq_session';

/** Requires a valid session cookie; puts the student row on `req.student` (R-35). */
export function requireAuth(authService) {
  return handle(async (req, _res, next) => {
    const student = await authService.authenticate(req.cookies?.[SESSION_COOKIE]);
    if (!student) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in again.');
    req.student = student;
    next();
  });
}

export function sessionCookieOptions(config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: config.sessionInactivityMinutes * 60 * 1000,
  };
}
