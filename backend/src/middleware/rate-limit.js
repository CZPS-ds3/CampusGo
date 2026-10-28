import rateLimit from 'express-rate-limit';

const limited = (windowMs, limit, code, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code, message } }),
    ...extra,
  });

/** Disabled in tests so that suites can hammer the endpoints; the limits are tested separately. */
export function createLimiters(config, { enabled = !config.isTest } = {}) {
  const pass = (_req, _res, next) => next();
  if (!enabled) return { auth: pass, verify: pass, general: pass };
  return {
    auth: limited(
      15 * 60 * 1000,
      30,
      'RATE_LIMITED',
      'Too many attempts. Please wait a few minutes.',
    ),
    // Per student, not per IP: stops button spamming and trial-and-error searching for the circle
    // (Main Project Document, section 5). Runs after the session check, so req.student is set.
    verify: limited(
      60 * 1000,
      config.verifyLimitPerMin,
      'TOO_MANY',
      'Too many tries. Wait a minute.',
      { keyGenerator: (req) => `student:${req.student.student_id}` },
    ),
    general: limited(60 * 1000, 300, 'RATE_LIMITED', 'Too many requests. Please slow down.'),
  };
}
