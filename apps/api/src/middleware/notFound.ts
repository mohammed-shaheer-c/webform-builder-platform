import { Request, Response, NextFunction } from 'express';

export const notFoundHandler = (
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
};
