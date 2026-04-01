import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';

export function verifyFacebookSignature(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  if (!signature) {
    // eslint-disable-next-line no-console
    console.warn(`[facebook:webhook] imzo yo'q path=${req.path} ip=${req.ip}`);
    res.status(401).json({ error: 'Imzo topilmadi' });
    return;
  }

  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    // eslint-disable-next-line no-console
    console.warn(`[facebook:webhook] raw body yo'q path=${req.path} ip=${req.ip}`);
    res.status(400).json({ error: 'Raw body mavjud emas' });
    return;
  }

  const expected = 'sha256=' + createHmac('sha256', getEnv().FB_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    // eslint-disable-next-line no-console
    console.warn(`[facebook:webhook] imzo noto'g'ri path=${req.path} ip=${req.ip}`);
    res.status(401).json({ error: 'Imzo tekshiruvi muvaffaqiyatsiz' });
    return;
  }

  next();
}

export function computeHmac(secret: string, payload: Buffer | string): string {
  return 'sha256=' + createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}
