import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';
import { addLeadJob, getLeadQueue } from '../queue/lead-queue.js';

const router = Router();

router.use(requireAuth);

// ── GET / — list leads for user ──

const listSchema = z.object({
  integration_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'delivered', 'failed', 'dlq', 'duplicate']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get('/', async (req, res, next) => {
  try {
    const query = listSchema.parse(req.query);
    const pool = getPool();

    const conditions: string[] = [
      `i.user_id = $1`,
    ];
    const values: unknown[] = [req.user!.userId];
    let idx = 2;

    if (query.integration_id) {
      conditions.push(`l.integration_id = $${idx++}`);
      values.push(query.integration_id);
    }

    if (query.status) {
      conditions.push(`l.status = $${idx++}`);
      values.push(query.status);
    }

    values.push(query.limit, query.offset);

    const result = await pool.query(
      `SELECT
         l.id, l.leadgen_id, l.integration_id, l.status,
         l.attempts, l.delivered_at, l.last_error,
         l.mapped_data, l.created_at, l.updated_at,
         i.name AS integration_name, i.source_type,
         COALESCE(l.mapped_data->>'crmLeadId', l.mapped_data->>'bitrixLeadId') AS crm_lead_id
       FROM leads l
       JOIN integrations i ON i.id = l.integration_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY l.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM leads l JOIN integrations i ON i.id = l.integration_id WHERE ${conditions.join(' AND ')}`,
      values.slice(0, -2),
    );

    res.json({
      leads: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      limit: query.limit,
      offset: query.offset,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

// ── GET /:id — single lead ──

router.get('/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         l.id, l.leadgen_id, l.integration_id, l.status,
         l.attempts, l.raw_data, l.mapped_data,
         l.delivered_at, l.last_error, l.created_at, l.updated_at,
         i.name AS integration_name, i.source_type,
         COALESCE(l.mapped_data->>'crmLeadId', l.mapped_data->>'bitrixLeadId') AS crm_lead_id
       FROM leads l
       JOIN integrations i ON i.id = l.integration_id
       WHERE l.id = $1 AND i.user_id = $2`,
      [req.params.id, req.user!.userId],
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Lead topilmadi');
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── POST /:id/retry — re-queue a failed/DLQ lead ──

router.post('/:id/retry', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT l.id, l.leadgen_id, l.integration_id, l.status
       FROM leads l
       JOIN integrations i ON i.id = l.integration_id
       WHERE l.id = $1 AND i.user_id = $2`,
      [req.params.id, req.user!.userId],
    );

    if (result.rows.length === 0) {
      throw new AppError(404, 'Lead topilmadi');
    }

    const lead = result.rows[0];

    if (!['failed', 'dlq'].includes(lead.status)) {
      throw new AppError(400, `Faqat failed yoki dlq statusidagi leadlarni qayta yuborish mumkin (hozir: ${lead.status})`);
    }

    // Fetch page_id from integration
    const intResult = await pool.query(
      `SELECT source_page_id FROM integrations WHERE id = $1`,
      [lead.integration_id],
    );

    // Remove old BullMQ job with the same deterministic jobId so retry can enqueue again.
    const existingJob = await getLeadQueue().getJob(`lead-${lead.leadgen_id}`);
    if (existingJob) {
      await existingJob.remove();
    }

    // Reset status and re-queue
    await pool.query(
      `UPDATE leads SET status = 'pending', attempts = 0, last_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [lead.id],
    );

    await addLeadJob({
      leadgenId: lead.leadgen_id,
      integrationId: lead.integration_id,
      pageId: intResult.rows[0]?.source_page_id ?? '',
    });

    res.json({ message: 'Lead qayta navbatga qo\'shildi', leadId: lead.id });
  } catch (err) {
    next(err);
  }
});

// ── GET /stats/summary — delivery stats per integration ──

router.get('/stats/summary', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT
         i.id AS integration_id,
         i.name AS integration_name,
         COUNT(*) FILTER (WHERE l.status = 'delivered') AS delivered,
         COUNT(*) FILTER (WHERE l.status = 'failed') AS failed,
         COUNT(*) FILTER (WHERE l.status = 'dlq') AS dlq,
         COUNT(*) FILTER (WHERE l.status = 'duplicate') AS duplicate,
         COUNT(*) AS total
       FROM integrations i
       LEFT JOIN leads l ON l.integration_id = i.id
       WHERE i.user_id = $1
       GROUP BY i.id, i.name
       ORDER BY i.created_at DESC`,
      [req.user!.userId],
    );

    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

export default router;
