import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  status?: number;
  details?: unknown;
}

export const errorHandler = (
  err: AppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void => {
  // Handle payload too large (413 from body-parser)
  if (err.message && err.message.includes('request entity too large')) {
    res.status(413).json({
      error: {
        message: 'Request payload too large. Maximum allowed size is 1MB.',
      },
    });
    return;
  }

  const statusCode =
    (err.statusCode && Number.isInteger(err.statusCode) && err.statusCode) ||
    (err.status && Number.isInteger(err.status) && err.status) ||
    500;

  // In production, mask internal server error messages to prevent credential/path/SQL leakage
  const safeMessage =
    env.NODE_ENV === 'production' && statusCode === 500
      ? 'An unexpected error occurred. Please contact support.'
      : err.message || 'Internal Server Error';

  console.error(`[Error] ${statusCode} - ${err.message}`, {
    stack: err.stack,
    details: err.details,
  });

  res.status(statusCode).json({
    error: {
      message: safeMessage,
      ...(env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err.details,
      }),
    },
  });
};
