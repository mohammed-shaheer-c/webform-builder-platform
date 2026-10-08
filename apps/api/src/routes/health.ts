import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Health check endpoint.
 * Returns: { "status": "ok" }
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

export default router;
