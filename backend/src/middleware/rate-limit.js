import rateLimit from 'express-rate-limit';

const limited = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
  });

/** Disabled in tests so that suites can hammer the endpoints; the limits are tested separately. */
export function createLimiters(config, { enabled = !config.isTest } = {}) {
  const pass = (_req, _res, next) => next();
  if (!enabled) return { auth: pass, location: pass, general: pass };
  return {
    auth: limited(15 * 60 * 1000, 30, 'Too many attempts. Please wait a few minutes.'),
    location: limited(60 * 1000, 20, 'Too many location checks. Please wait a moment.'),
    general: limited(60 * 1000, 300, 'Too many requests. Please slow down.'),
  };
}
