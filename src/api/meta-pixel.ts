import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/error-handler.js';
import { getPool } from '../db/pool.js';

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

const upsertPixelConfigSchema = z.object({
  name: z.string().min(1).max(120).default('Meta Pixel'),
  pixel_id: z.string().min(4).max(128),
  active: z.boolean().default(true),
  auto_page_view: z.boolean().default(true),
});

const trackPixelEventSchema = z.object({
  config_id: z.string().uuid().optional(),
  integration_id: z.string().uuid().optional(),
  source: z.string().min(1).max(64).default('pixel'),
  event_name: z.string().min(1).max(80),
  event_id: z.string().min(6).max(128),
  event_time: z.coerce.date().optional(),
  action_source: actionSourceSchema.default('website'),
  event_source_url: z.string().url().optional(),
  user_data: z.record(z.unknown()).default({}),
  custom_data: z.record(z.unknown()).default({}),
  browser_meta: z.record(z.unknown()).default({}),
  fbq_sent: z.boolean().default(false),
  blocked_reason: z.string().max(200).optional(),
});

const listPixelEventsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

function parseIsoDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date(0);
}

router.get('/config', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, active, pixel_id, auto_page_view, created_at, updated_at
       FROM meta_pixel_configs
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user!.userId],
    );
    res.json({ configs: result.rows });
  } catch (err) {
    next(err);
  }
});

router.post('/config', async (req, res, next) => {
  try {
    const body = upsertPixelConfigSchema.parse(req.body);
    const pool = getPool();

    const result = await pool.query(
      `INSERT INTO meta_pixel_configs (user_id, name, active, pixel_id, auto_page_view)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, pixel_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         active = EXCLUDED.active,
         auto_page_view = EXCLUDED.auto_page_view,
         updated_at = NOW()
       RETURNING id, name, active, pixel_id, auto_page_view, created_at, updated_at`,
      [req.user!.userId, body.name, body.active, body.pixel_id, body.auto_page_view],
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
    const body = trackPixelEventSchema.parse(req.body);
    const pool = getPool();

    let configId = body.config_id;
    if (!configId) {
      const activeResult = await pool.query(
        `SELECT id
         FROM meta_pixel_configs
         WHERE user_id = $1 AND active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [req.user!.userId],
      );
      if (activeResult.rows.length === 0) {
        throw new AppError(400, 'Active Meta Pixel config topilmadi');
      }
      configId = activeResult.rows[0].id as string;
    } else {
      const ownResult = await pool.query(
        `SELECT id FROM meta_pixel_configs WHERE id = $1 AND user_id = $2`,
        [configId, req.user!.userId],
      );
      if (ownResult.rows.length === 0) {
        throw new AppError(404, 'Meta Pixel config topilmadi');
      }
    }

    const eventTime = body.event_time ?? new Date();
    const result = await pool.query(
      `INSERT INTO meta_pixel_events (
         user_id, config_id, integration_id, source, event_name, event_id, event_time,
         action_source, event_source_url, user_data, custom_data, browser_meta, fbq_sent, blocked_reason
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14)
       RETURNING id, event_name, event_id, event_time, fbq_sent, blocked_reason, created_at`,
      [
        req.user!.userId,
        configId,
        body.integration_id ?? null,
        body.source,
        body.event_name,
        body.event_id,
        eventTime.toISOString(),
        body.action_source,
        body.event_source_url ?? null,
        JSON.stringify(body.user_data),
        JSON.stringify(body.custom_data),
        JSON.stringify(body.browser_meta),
        body.fbq_sent,
        body.blocked_reason ?? null,
      ],
    );

    res.status(202).json({ event: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0]?.message ?? 'Noto\'g\'ri so\'rov' });
      return;
    }
    next(err);
  }
});

router.get('/events', async (req, res, next) => {
  try {
    const query = listPixelEventsSchema.parse(req.query);
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         e.id, e.event_name, e.event_id, e.event_time, e.action_source, e.event_source_url,
         e.fbq_sent, e.blocked_reason, e.created_at,
         c.pixel_id, c.name AS config_name
       FROM meta_pixel_events e
       JOIN meta_pixel_configs c ON c.id = e.config_id
       WHERE e.user_id = $1
       ORDER BY e.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.userId, query.limit, query.offset],
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS count FROM meta_pixel_events WHERE user_id = $1`,
      [req.user!.userId],
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

router.get('/diagnostics', async (req, res, next) => {
  try {
    const pool = getPool();

    const pixelResult = await pool.query(
      `SELECT event_id, event_name, event_time, fbq_sent, blocked_reason
       FROM meta_pixel_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user!.userId],
    );

    const capiResult = await pool.query(
      `SELECT event_id, event_name, event_time, status
       FROM meta_capi_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user!.userId],
    );

    const pixelByEventId = new Map<string, {
      event_id: string;
      event_name: string;
      event_time: string;
      fbq_sent: boolean;
      blocked_reason: string | null;
    }>();
    for (const row of pixelResult.rows) {
      pixelByEventId.set(row.event_id as string, row as {
        event_id: string;
        event_name: string;
        event_time: string;
        fbq_sent: boolean;
        blocked_reason: string | null;
      });
    }

    const capiByEventId = new Map<string, {
      event_id: string;
      event_name: string;
      event_time: string;
      status: string;
    }>();
    for (const row of capiResult.rows) {
      capiByEventId.set(row.event_id as string, row as {
        event_id: string;
        event_name: string;
        event_time: string;
        status: string;
      });
    }

    const missingInCapi: Array<Record<string, unknown>> = [];
    const missingInPixel: Array<Record<string, unknown>> = [];
    const nameMismatches: Array<Record<string, unknown>> = [];
    const timeDrift: Array<Record<string, unknown>> = [];
    const driftThresholdSec = 120;

    for (const [eventId, pixel] of pixelByEventId.entries()) {
      const capi = capiByEventId.get(eventId);
      if (!capi) {
        missingInCapi.push({
          event_id: eventId,
          event_name: pixel.event_name,
          event_time: pixel.event_time,
          fbq_sent: pixel.fbq_sent,
          blocked_reason: pixel.blocked_reason,
        });
        continue;
      }

      if (pixel.event_name !== capi.event_name) {
        nameMismatches.push({
          event_id: eventId,
          pixel_event_name: pixel.event_name,
          capi_event_name: capi.event_name,
        });
      }

      const diffSec = Math.abs(
        Math.floor((parseIsoDate(pixel.event_time).getTime() - parseIsoDate(capi.event_time).getTime()) / 1000),
      );
      if (diffSec > driftThresholdSec) {
        timeDrift.push({
          event_id: eventId,
          diff_seconds: diffSec,
          pixel_event_time: pixel.event_time,
          capi_event_time: capi.event_time,
        });
      }
    }

    for (const [eventId, capi] of capiByEventId.entries()) {
      if (pixelByEventId.has(eventId)) continue;
      missingInPixel.push({
        event_id: eventId,
        event_name: capi.event_name,
        event_time: capi.event_time,
        capi_status: capi.status,
      });
    }

    res.json({
      summary: {
        pixel_events: pixelResult.rows.length,
        capi_events: capiResult.rows.length,
        missing_in_capi: missingInCapi.length,
        missing_in_pixel: missingInPixel.length,
        event_name_mismatch: nameMismatches.length,
        timestamp_drift: timeDrift.length,
      },
      samples: {
        missing_in_capi: missingInCapi.slice(0, 20),
        missing_in_pixel: missingInPixel.slice(0, 20),
        event_name_mismatch: nameMismatches.slice(0, 20),
        timestamp_drift: timeDrift.slice(0, 20),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
