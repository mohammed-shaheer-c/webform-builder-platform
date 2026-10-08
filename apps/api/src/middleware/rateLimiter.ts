import rateLimit from 'express-rate-limit';
import { Request } from 'express';

/**
 * General API Rate Limiter.
 * Protects endpoints from excessive requests while remaining friendly to local development and testing.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Max 1000 requests per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  skip: (req: Request) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.NODE_ENV !== 'production' && req.headers['x-load-test'] === 'true') return true;
    return false;
  },
});

/**
 * Per-Form Submission Rate Limiter.
 * Protects individual forms from submission bursts while allowing normal user interactions.
 */
export const formSubmissionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60, // Max 60 submissions per minute per IP per form
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disables IPv6 key generator warning check in test/dev
  keyGenerator: (req: Request) => {
    const formId = req.params.formId || 'unknown';
    const ip = req.ip || req.socket.remoteAddress || '127.0.0.1';
    return `${ip}_${formId}`;
  },
  message: {
    error: {
      message: 'Too many submissions for this form. Please wait a moment before trying again.',
    },
  },
  skip: (req: Request) => {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.NODE_ENV !== 'production' && req.headers['x-load-test'] === 'true') return true;
    return false;
  },
});
