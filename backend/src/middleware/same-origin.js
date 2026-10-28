import { AppError } from './errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth (OWASP A01). SameSite=Lax cookies are still sent by sibling sites on the same
 * registrable domain, and several endpoints take no body, so state-changing requests must come from the
 * web app's own origin. Requests without browser origin headers (curl, tests) are not cross-site requests.
 */
export function requireSameOrigin(allowedOrigin) {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get('origin');
    const fetchSite = req.get('sec-fetch-site');
    const crossSite = origin ? origin !== allowedOrigin : fetchSite === 'cross-site';
    if (crossSite) return next(new AppError(403, 'FORBIDDEN_ORIGIN', 'Request blocked.'));
    return next();
  };
}
