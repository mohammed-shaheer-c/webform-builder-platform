import { Router } from 'express';
import healthRouter from './health';
import formsRouter from './forms';
import publicRouter from './public';

const router = Router();

// Mount health check routes
router.use(healthRouter);

// Mount tenant forms routes
router.use('/forms', formsRouter);

// Mount public form and submission routes
router.use('/public', publicRouter);

export default router;
