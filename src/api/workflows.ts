import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getPool } from '../db/pool.js';
import { AppError } from '../middleware/error-handler.js';
import { dispatchPublishedWorkflow } from '../services/workflow-dispatch.js';
import { WORKFLOW_SOURCE_TYPE, WORKFLOW_TRIGGER_TYPE } from '../services/workflow-runtime.js';

const router = Router();

router.use(requireAuth);

const runStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'canceled', 'dlq']);

const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow nomi kiritilishi shart'),
  description: z.string().optional(),
  source_type: z.string().default(WORKFLOW_SOURCE_TYPE),
  trigger_type: z.string().default(WORKFLOW_TRIGGER_TYPE),
  source_config: z.record(z.unknown()).default({}),
});

const createVersionSchema = z.object({
  definition: z.record(z.unknown()),
});

const publishVersionSchema = z.object({
  version_id: z.string().uuid().optional(),
  version: z.coerce.number().int().positive().optional(),
}).refine((v) => v.version_id || v.version, {
  message: 'version_id yoki version yuborilishi shart',
});

const dispatchSchema = z.object({
  trigger_event_id: z.string().min(1),
  source_ref: z.string().min(1),
  context: z.record(z.unknown()).default({}),
});

const listRunsSchema = z.object({
  workflow_id: z.string().uuid().optional(),
  status: runStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

async function findOwnedWorkflow(workflowId: string, userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, user_id, name, active, source_type, trigger_type, source_config
     FROM workflows
     WHERE id = $1 AND user_id = $2`,
    [workflowId, userId],
  );
  if (result.rows.length === 0) {
    throw new AppError(404, 'Workflow topilmadi');
  }
  return result.rows[0] as {
    id: string;
    user_id: string;
    name: string;
    active: boolean;
    source_type: string;
    trigger_type: string;
    source_config: Record<string, unknown>;
  };
}

router.post('/', async (req, res, next) => {
  try {
    const body = createWorkflowSchema.parse(req.body);
    const sourceType = body.source_type.trim();
    const triggerType = body.trigger_type.trim();
    if (sourceType.startsWith('meta') || triggerType.startsWith('meta.')) {
      throw new AppError(
        400,
        'meta.* triggerlar qo\'llab-quvvatlanmaydi. source_type=lead_bridge va trigger_type=lead.received dan foydalaning.',
      );
    }
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO workflows (
         user_id, name, description, active, source_type, trigger_type, source_config
       ) VALUES ($1, $2, $3, true, $4, $5, $6::jsonb)
       RETURNING id, name, description, active, source_type, trigger_type, source_config, created_at, updated_at`,
      [
        req.user!.userId,
        body.name,
        body.description ?? null,
        sourceType,
        triggerType,
        JSON.stringify(body.source_config),
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/:id/versions', async (req, res, next) => {
  try {
    const body = createVersionSchema.parse(req.body);
    await findOwnedWorkflow(req.params.id, req.user!.userId);
    const pool = getPool();

    const maxResult = await pool.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version
       FROM workflow_versions
       WHERE workflow_id = $1`,
      [req.params.id],
    );
    const nextVersion = Number(maxResult.rows[0].max_version) + 1;

    const result = await pool.query(
      `INSERT INTO workflow_versions (
         workflow_id, version, is_published, definition, created_by
       ) VALUES ($1, $2, false, $3::jsonb, $4)
       RETURNING id, workflow_id, version, is_published, definition, created_by, created_at`,
      [req.params.id, nextVersion, JSON.stringify(body.definition), req.user!.userId],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/:id/publish', async (req, res, next) => {
  try {
    const body = publishVersionSchema.parse(req.body);
    await findOwnedWorkflow(req.params.id, req.user!.userId);
    const pool = getPool();

    let targetResult;
    if (body.version_id) {
      targetResult = await pool.query(
        `SELECT id, version
         FROM workflow_versions
         WHERE workflow_id = $1 AND id = $2`,
        [req.params.id, body.version_id],
      );
    } else {
      targetResult = await pool.query(
        `SELECT id, version
         FROM workflow_versions
         WHERE workflow_id = $1 AND version = $2`,
        [req.params.id, body.version],
      );
    }

    if (targetResult.rows.length === 0) {
      throw new AppError(404, 'Publish qilinadigan workflow version topilmadi');
    }

    const targetVersionId = targetResult.rows[0].id;

    await pool.query('BEGIN');
    try {
      await pool.query(
        `UPDATE workflow_versions
         SET is_published = false
         WHERE workflow_id = $1`,
        [req.params.id],
      );

      await pool.query(
        `UPDATE workflow_versions
         SET is_published = true
         WHERE id = $1`,
        [targetVersionId],
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }

    res.json({
      message: 'Workflow version publish qilindi',
      workflow_id: req.params.id,
      version_id: targetVersionId,
      version: targetResult.rows[0].version,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.post('/:id/dispatch', async (req, res, next) => {
  try {
    const body = dispatchSchema.parse(req.body);
    const workflow = await findOwnedWorkflow(req.params.id, req.user!.userId);
    if (workflow.source_type.startsWith('meta') || workflow.trigger_type.startsWith('meta.')) {
      throw new AppError(
        400,
        'Ushbu workflow meta.* triggerdan foydalanadi va endi qo\'llab-quvvatlanmaydi. Yangi workflow yarating: source_type=lead_bridge, trigger_type=lead.received.',
      );
    }
    const pool = getPool();

    const versionResult = await pool.query(
      `SELECT id, version, definition
       FROM workflow_versions
       WHERE workflow_id = $1 AND is_published = true
       ORDER BY version DESC
       LIMIT 1`,
      [req.params.id],
    );
    if (versionResult.rows.length === 0) {
      throw new AppError(400, 'Workflow publish qilinmagan');
    }

    const workflowVersion = versionResult.rows[0] as {
      id: string;
      version: number;
      definition: Record<string, unknown>;
    };

    const result = await dispatchPublishedWorkflow({
      pool,
      userId: req.user!.userId,
      workflowId: req.params.id,
      workflowVersionId: workflowVersion.id,
      definition: workflowVersion.definition,
      sourceConfig: workflow.source_config ?? {},
      triggerEventId: body.trigger_event_id,
      sourceRef: body.source_ref,
      context: body.context,
    });

    res.status(201).json({
      message: 'Workflow dispatch bajarildi',
      run: {
        id: result.runId,
        status: result.status,
        steps_executed: result.stepsExecuted,
        workflow_version: workflowVersion.version,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, name, active, source_type, trigger_type, created_at, updated_at
       FROM workflows
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user!.userId],
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get('/runs', async (req, res, next) => {
  try {
    const query = listRunsSchema.parse(req.query);
    const pool = getPool();

    const conditions: string[] = [
      `w.user_id = $1`,
    ];
    const values: unknown[] = [req.user!.userId];
    let idx = 2;

    if (query.workflow_id) {
      conditions.push(`r.workflow_id = $${idx++}`);
      values.push(query.workflow_id);
    }

    if (query.status) {
      conditions.push(`r.status = $${idx++}`);
      values.push(query.status);
    }

    values.push(query.limit, query.offset);

    const result = await pool.query(
      `SELECT
         r.id, r.workflow_id, r.workflow_version_id, r.trigger_event_id,
         r.source_type, r.source_ref, r.status, r.attempts, r.last_error,
         r.started_at, r.finished_at, r.created_at, r.updated_at,
         w.name AS workflow_name,
         v.version AS workflow_version
       FROM workflow_runs r
       JOIN workflows w ON w.id = r.workflow_id
       JOIN workflow_versions v ON v.id = r.workflow_version_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      values,
    );

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM workflow_runs r
       JOIN workflows w ON w.id = r.workflow_id
       WHERE ${conditions.join(' AND ')}`,
      values.slice(0, -2),
    );

    res.json({
      runs: result.rows,
      total: Number(countResult.rows[0].total),
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

router.get('/runs/:id', async (req, res, next) => {
  try {
    const pool = getPool();
    const runResult = await pool.query(
      `SELECT
         r.id, r.workflow_id, r.workflow_version_id, r.trigger_event_id,
         r.source_type, r.source_ref, r.status, r.attempts, r.last_error,
         r.context, r.started_at, r.finished_at, r.created_at, r.updated_at,
         w.name AS workflow_name,
         v.version AS workflow_version
       FROM workflow_runs r
       JOIN workflows w ON w.id = r.workflow_id
       JOIN workflow_versions v ON v.id = r.workflow_version_id
       WHERE r.id = $1 AND w.user_id = $2`,
      [req.params.id, req.user!.userId],
    );

    if (runResult.rows.length === 0) {
      throw new AppError(404, 'Workflow run topilmadi');
    }

    const stepsResult = await pool.query(
      `SELECT
         id, run_id, step_key, step_type, step_order, attempt, status,
         input_data, output_data, error_data, started_at, finished_at, created_at, updated_at
       FROM workflow_steps
       WHERE run_id = $1
       ORDER BY step_order ASC, attempt ASC, created_at ASC`,
      [req.params.id],
    );

    res.json({
      run: runResult.rows[0],
      steps: stepsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
