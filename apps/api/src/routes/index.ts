import { Router } from 'express';
import healthRouter from './health';
import formsRouter from './forms';

const router = Router();

// Mount health check routes
router.use(healthRouter);

// Mount forms routes
router.use('/forms', formsRouter);

export default router;
