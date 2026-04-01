import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token taqdim etilmagan' });
    return;
  }

  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' });
  }
}
