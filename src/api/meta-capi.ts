import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { getPool } from '../db/pool.js';
import { encrypt } from '../config/encryption.js';
import { addMetaCapiJob, getMetaCapiQueue } from '../queue/meta-capi-queue.js';
import { buildMetaUserData, createStableMetaEventId } from '../services/meta-conversions.js';

const router = Router();
router.use(requireAuth);

const actionSourceSchema = z.enum([
  'website',
  'app',
  'phone_call',
  'chat',
  'physical_store',
  'system_generated',
  'business_messaging',
  'other',
]);

const upsertConfigSchema = z.object({
  name: z.string().min(1).max(120).default('Meta CAPI'),
  pixel_id: z.string().min(4).max(128),
  access_token: z.string().min(16),
  test_event_code: z.string().min(1).max(128).optional().nullable(),
  active: z.boolean().default(true),
});

const listEventsSchema = z.object({
  status: z.enum(['pending', 'processing', 'delivered', 'failed', 'dlq', 'duplicate']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const enqueueEventSchema = z.object({
  config_id: z.string().uuid().optional(),
  integration_id: z.string().uuid().optional(),
  source: z.string().min(1).max(64).default('meta'),
  event_name: z.string().min(1).max(80),
  event_id: z.string().min(6).max(128).optional(),
  event_time: z.coerce.date().optional(),
  action_source: actionSourceSchema.default('website'),
  event_source_url: z.string().url().optional(),
  user_data: z.record(z.unknown()).default({}),
  custom_data: z.record(z.unknown()).default({}),
});

router.get('/config', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, active, pixel_id, created_at, updated_at,
              CASE WHEN access_token IS NULL OR access_token = '' THEN false ELSE true END AS has_access_token,
              CASE WHEN test_event_code IS NULL OR test_event_code = '' THEN false ELSE true END AS has_test_event_code
       FROM meta_capi_configs
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.userId],
    );
    res.json({ configs: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/config', async (req, res, next) => {
  try {
    const body = upsertConfigSchema.parse(req.body);
    const pool = getPool();

    const tokenEncrypted = encrypt(body.access_token);
    const testCodeEncrypted = body.test_event_code ? encrypt(body.test_event_code) : null;

    const result = await pool.query(
      `INSERT INTO meta_capi_configs (
         user_id, name, active, pixel_id, access_token, test_event_code
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, pixel_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         active = EXCLUDED.active,
         access_token = EXCLUDED.access_token,
         test_event_code = EXCLUDED.test_event_code,
         updated_at = NOW()
       RETURNING id, name, active, pixel_id, created_at, updated_at`,
      [req.user!.userId, body.name, body.active, body.pixel_id, tokenEncrypted, testCodeEncrypted],
    );

    res.status(201).json({ config: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Noto\'g\'ri so\'rov' });
      return;
    }
    next(err);
  }
});

router.post('/events', async (req, res, next) => {
  try {
    const body = enqueueEventSchema.parse(req.body);
    const pool = getPool();

    let configId = body.config_id;
    if (!configId) {
      const configResult = await pool.query(
        `SELECT id
         FROM meta_capi_configs
         WHERE user_id = $1 AND active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [req.user!.userId],
      );
      if (configResult.rows.length === 0) {
        throw new AppError(400, 'Avval active Meta CAPI config yarating');
      }
      configId = configResult.rows[0].id as string;
    } else {
      const ownResult = await pool.query(
        `SELECT id FROM meta_capi_configs WHERE id = $1 AND user_id = $2`,
        [configId, req.user!.userId],
      );
      if (ownResult.rows.length === 0) {
        throw new AppError(404, 'Meta CAPI config topilmadi');
      }
    }

    const eventTime = body.event_time ?? new Date();
    const stableExternalRef =
      (typeof body.custom_data.external_ref === 'string' && body.custom_data.external_ref)
      || (typeof body.user_data.external_id === 'string' && body.user_data.external_id)
      || (typeof body.user_data.em === 'string' && body.user_data.em)
      || (typeof body.user_data.ph === 'string' && body.user_data.ph)
      || body.event_source_url
      || null;
    const eventId = body.event_id ?? createStableMetaEventId({
      userId: req.user!.userId,
      eventName: body.event_name,
      eventTime,
      actionSource: body.action_source,
      externalRef: stableExternalRef,
    });

    const userData = buildMetaUserData(body.user_data);
    const rawPayload = {
      source: body.source,
      event_name: body.event_name,
      event_time: eventTime.toISOString(),
      event_id: eventId,
      action_source: body.action_source,
      event_source_url: body.event_source_url ?? null,
      user_data: userData,
      custom_data: body.custom_data,
    };

    const inserted = await pool.query(
      `INSERT INTO meta_capi_events (
         user_id, config_id, integration_id, source, event_name, event_id, event_time,
         action_source, event_source_url, user_data, custom_data, raw_payload, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, 'pending')
       ON CONFLICT (user_id, event_id) DO NOTHING
       RETURNING id, status, event_id, event_name, event_time, created_at`,
      [
        req.user!.userId,
        configId,
        body.integration_id ?? null,
        body.source,
        body.event_name,
        eventId,
        eventTime.toISOString(),
        body.action_source,
        body.event_source_url ?? null,
        JSON.stringify(userData),
        JSON.stringify(body.custom_data),
        JSON.stringify(rawPayload),
      ],
    );

    if (inserted.rows.length === 0) {
      const existing = await pool.query(
        `SELECT id, status, event_id, event_name, event_time, created_at
         FROM meta_capi_events
         WHERE user_id = $1 AND event_id = $2
         LIMIT 1`,
        [req.user!.userId, eventId],
      );
      res.status(200).json({
        duplicate: true,
        event: existing.rows[0],
      });
      return;
    }

    const eventRow = inserted.rows[0] as {
      id: string;
      event_id: string;
      event_name: string;
      event_time: string;
      status: string;
      created_at: string;
    };

    await addMetaCapiJob({ eventId: eventRow.id });
    res.status(202).json({
      queued: true,
      event: eventRow,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Noto\'g\'ri so\'rov' });
      return;
    }
    next(err);
  }
});

router.post('/events/:id/retry', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, status, event_id
       FROM meta_capi_events
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [req.params.id, req.user!.userId],
    );
    if (result.rows.length === 0) {
      throw new AppError(404, 'Event topilmadi');
    }
    const event = result.rows[0] as { id: string; status: string; event_id: string };
    if (!['failed', 'dlq'].includes(event.status)) {
      throw new AppError(400, `Faqat failed/dlq event qayta yuboriladi (hozir: ${event.status})`);
    }

    const existingJob = await getMetaCapiQueue().getJob(`meta-capi-${event.id}`);
    if (existingJob) {
      await existingJob.remove();
    }

    await pool.query(
      `UPDATE meta_capi_events
       SET status = 'pending', last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [event.id],
    );

    await addMetaCapiJob({ eventId: event.id });
    res.json({ message: 'Event qayta navbatga qo\'shildi', event_id: event.event_id });
  } catch (err) {
    next(err);
  }
});

router.get('/events', async (req, res, next) => {
  try {
    const query = listEventsSchema.parse(req.query);
    const pool = getPool();

    const conditions: string[] = ['e.user_id = $1'];
    const values: unknown[] = [req.user!.userId];
    let idx = 2;
    if (query.status) {
      conditions.push(`e.status = $${idx++}`);
      values.push(query.status);
    }
    values.push(query.limit, query.offset);

    const result = await pool.query(
      `SELECT
         e.id, e.event_name, e.event_id, e.event_time, e.status, e.attempts,
         e.last_error, e.delivered_at, e.created_at, e.updated_at, e.source,
         c.pixel_id, c.name AS config_name
       FROM meta_capi_events e
       JOIN meta_capi_configs c ON c.id = e.config_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count
       FROM meta_capi_events e
       WHERE ${conditions.join(' AND ')}`,
      values.slice(0, -2),
    );

    res.json({
      events: result.rows,
      total: Number(countResult.rows[0].count ?? 0),
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Noto\'g\'ri so\'rov' });
      return;
    }
    next(err);
  }
});

export default router;
