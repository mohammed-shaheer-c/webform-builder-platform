import { Router } from 'express';
import healthRouter from './health';

const router = Router();

// Mount health check routes
router.use(healthRouter);

export default router;
