import { Request, Response, NextFunction } from 'express';
import { DEV_TENANT, ensureDevTenant } from '../config/tenant';

// Extend Express Request interface to include tenantId
declare global {
  namespace Express {
    interface Request {
      tenantId: string;
    }
  }
}

/**
 * Tenant Middleware.
 * Pinned strictly to the development tenant.
 * Prevents clients from supplying or spoofing another tenant ID.
 */
export async function tenantMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Ensure dev tenant exists in database
    await ensureDevTenant();
    
    // Bind current request strictly to the development tenant
    req.tenantId = DEV_TENANT.id;
    next();
  } catch (error) {
    next(error);
  }
}
