import { AppError } from './errors.js';

/** Only students with the admin role may continue (after requireAuth). */
export function requireAdmin(req, _res, next) {
  if (req.student?.role !== 'admin') {
    return next(new AppError(403, 'FORBIDDEN', 'This area is for administrators.'));
  }
  return next();
}
