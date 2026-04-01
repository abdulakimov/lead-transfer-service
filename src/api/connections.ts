import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../db/pool.js';
import { encrypt, decrypt } from '../config/encryption.js';
import { AppError } from '../middleware/error-handler.js';

const router = Router();
router.use(requireAuth);

const credentialsSchema = z.record(z.any());

const upsertSchema = z.object({
  provider: z.enum(['facebook', 'google']),
  external_id: z.string().min(1),
  name: z.string().min(1),
  credentials: credentialsSchema,
  meta: z.record(z.any()).optional(),
});

function sanitizeSummary(row: Record<string, unknown>) {
  return {
    id: row.id,
    provider: row.provider,
    external_id: row.external_id,
    name: row.name,
    meta: row.meta ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sanitizeDetail(row: Record<string, unknown>) {
  let credentials: Record<string, unknown> = {};
  try {
    credentials = JSON.parse(decrypt(String(row.credentials))) as Record<string, unknown>;
  } catch {
    credentials = {};
  }
  return {
    ...sanitizeSummary(row),
    credentials,
  };
}

async function findOwnedConnection(id: string, userId: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM connections WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Ulanish topilmadi');
  }
  return result.rows[0];
}

async function ensureFacebookConnectionOwnership(params: {
  userId: string;
  externalId: string;
}) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT c.id, c.name, u.email
     FROM connections c
     JOIN users u ON u.id = c.user_id
     WHERE c.provider = 'facebook'
       AND c.external_id = $1
       AND c.user_id <> $2
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [params.externalId, params.userId],
  );

  if (result.rows.length > 0) {
    const row = result.rows[0] as { id: string; name: string; email: string };
    throw new AppError(
      409,
      `Bu Facebook akkaunt allaqachon ulangan: ${row.name} (${row.email}). Ulanish uchun avval o'sha akkauntdan uzing.`,
    );
  }
}

router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM connections WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user!.userId],
    );
    res.json(result.rows.map((row) => sanitizeSummary(row as Record<string, unknown>)));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const row = await findOwnedConnection(req.params.id, req.user!.userId);
    res.json(sanitizeDetail(row as Record<string, unknown>));
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const body = upsertSchema.parse(req.body);
    if (body.provider === 'facebook') {
      await ensureFacebookConnectionOwnership({
        userId: req.user!.userId,
        externalId: body.external_id,
      });
    }
    const pool = getPool();
    const encrypted = encrypt(JSON.stringify(body.credentials));
    const meta = body.meta ?? {};

    const result = await pool.query(
      `
      INSERT INTO connections (user_id, provider, external_id, name, credentials, meta)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (user_id, provider, external_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        credentials = EXCLUDED.credentials,
        meta = EXCLUDED.meta,
        updated_at = NOW()
      RETURNING *
      `,
      [req.user!.userId, body.provider, body.external_id, body.name, encrypted, JSON.stringify(meta)],
    );

    res.status(201).json(sanitizeSummary(result.rows[0] as Record<string, unknown>));
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await findOwnedConnection(req.params.id, req.user!.userId);
    const pool = getPool();
    await pool.query('DELETE FROM connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.userId]);
    res.json({ message: 'Ulanish ochirildi' });
  } catch (err) {
    next(err);
  }
});

export default router;
