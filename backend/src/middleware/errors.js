import { ZodError } from 'zod';
import multer from 'multer';

/** An error that is safe to show to the client. */
export class AppError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = 'Not found') => new AppError(404, 'NOT_FOUND', what);

export function errorHandler(config) {
  return (error, req, res, _next) => {
    if (error instanceof AppError) {
      return res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message, ...error.details } });
    }
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'The request is not valid.',
          fields: error.issues.map((i) => i.path.join('.')),
        },
      });
    }
    if (error instanceof multer.MulterError) {
      const tooBig = error.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: {
          code: tooBig ? 'IMAGE_TOO_LARGE' : 'INVALID_IMAGE',
          message: tooBig ? 'The image is too large (limit 2 MB).' : 'The upload is not valid.',
        },
      });
    }
    if (error?.type === 'entity.parse.failed') {
      return res
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.' } });
    }
    // Never log request bodies: they can contain e-mail addresses, OTP codes or coordinates.
    if (!config.isTest) console.error(`[error] ${req.method} ${req.path}: ${error?.message}`);
    return res
      .status(500)
      .json({ error: { code: 'SERVER_ERROR', message: 'Something went wrong on our side.' } });
  };
}

/** Wraps an async route handler so rejected promises reach the error handler. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
