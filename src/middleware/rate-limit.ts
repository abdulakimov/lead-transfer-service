import type { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
}

interface CounterEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const counters = new Map<string, CounterEntry>();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;

    const existing = counters.get(key);
    if (!existing || now >= existing.resetAt) {
      counters.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (existing.count >= options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSec.toString());
      res.status(429).json({
        error: 'Juda ko\'p so\'rov yuborildi. Keyinroq qayta urinib ko\'ring.',
      });
      return;
    }

    existing.count += 1;
    next();
  };
}
