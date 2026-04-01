import type { Request, Response, NextFunction } from 'express';
import { formatErrorForLog } from '../utils/log-sanitize.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error(`Kutilmagan xato: ${formatErrorForLog(err)}`);
  res.status(500).json({ error: 'Ichki server xatosi' });
}
