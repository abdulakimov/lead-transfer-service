import type pg from 'pg';

interface EnsureWorkflowInput {
  userId: string;
  integrationId: string;
  destType: string;
}

interface RunInput {
  workflowId: string;
  workflowVersionId: string;
  triggerEventId: string;
  sourceRef: string;
  context: Record<string, unknown>;
  attempts: number;
}

interface StepInput {
  runId: string;
  stepKey: string;
  stepType: string;
  stepOrder: number;
  attempt: number;
  inputData?: Record<string, unknown>;
}

export interface WorkflowRunContext {
  runId: string;
  triggerStepId: string;
}

export async function ensurePublishedWorkflowVersion(
  pool: pg.Pool,
  input: EnsureWorkflowInput,
): Promise<{ workflowId: string; workflowVersionId: string }> {
  const existingWorkflow = await pool.query(
    `SELECT id
     FROM workflows
     WHERE user_id = $1
       AND source_type = 'meta'
       AND trigger_type = 'meta.lead.created'
       AND source_config->>'integration_id' = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.userId, input.integrationId],
  );

  let workflowId: string;
  if (existingWorkflow.rows.length > 0) {
    workflowId = existingWorkflow.rows[0].id as string;
  } else {
    const createdWorkflow = await pool.query(
      `INSERT INTO workflows (
         user_id, name, description, active, source_type, trigger_type, source_config
       ) VALUES ($1, $2, $3, true, 'meta', 'meta.lead.created', $4::jsonb)
       RETURNING id`,
      [
        input.userId,
        `System Meta -> ${input.destType} (${input.integrationId.slice(0, 8)})`,
        'Auto-created workflow for lead processor runtime logging',
        JSON.stringify({ integration_id: input.integrationId }),
      ],
    );
    workflowId = createdWorkflow.rows[0].id as string;
  }

  const publishedVersion = await pool.query(
    `SELECT id
     FROM workflow_versions
     WHERE workflow_id = $1 AND is_published = true
     ORDER BY version DESC
     LIMIT 1`,
    [workflowId],
  );

  if (publishedVersion.rows.length > 0) {
    return {
      workflowId,
      workflowVersionId: publishedVersion.rows[0].id as string,
    };
  }

  const maxVersionResult = await pool.query(
    `SELECT COALESCE(MAX(version), 0) AS max_version
     FROM workflow_versions
     WHERE workflow_id = $1`,
    [workflowId],
  );

  const nextVersion = Number(maxVersionResult.rows[0].max_version) + 1;
  const definition = {
    trigger: { type: 'meta.lead.created' },
    actions: [{ type: `${input.destType}.create_lead` }],
  };

  const createdVersion = await pool.query(
    `INSERT INTO workflow_versions (
       workflow_id, version, is_published, definition, created_by
     ) VALUES ($1, $2, true, $3::jsonb, $4)
     RETURNING id`,
    [workflowId, nextVersion, JSON.stringify(definition), input.userId],
  );

  return {
    workflowId,
    workflowVersionId: createdVersion.rows[0].id as string,
  };
}

export async function startWorkflowRun(
  pool: pg.Pool,
  input: RunInput,
): Promise<WorkflowRunContext> {
  const runResult = await pool.query(
    `INSERT INTO workflow_runs (
       workflow_id, workflow_version_id, trigger_event_id, source_type, source_ref,
       status, attempts, context, started_at
     ) VALUES ($1, $2, $3, 'meta', $4, 'running', $5, $6::jsonb, NOW())
     RETURNING id`,
    [
      input.workflowId,
      input.workflowVersionId,
      input.triggerEventId,
      input.sourceRef,
      input.attempts,
      JSON.stringify(input.context),
    ],
  );

  const runId = runResult.rows[0].id as string;
  const triggerStepId = await createStep(pool, {
    runId,
    stepKey: 'trigger.meta.lead.created',
    stepType: 'trigger',
    stepOrder: 1,
    attempt: input.attempts,
    inputData: { trigger_event_id: input.triggerEventId, source_ref: input.sourceRef },
  });

  return { runId, triggerStepId };
}

export async function createStep(
  pool: pg.Pool,
  input: StepInput,
): Promise<string> {
  const result = await pool.query(
    `INSERT INTO workflow_steps (
       run_id, step_key, step_type, step_order, attempt, status, input_data, started_at
     ) VALUES ($1, $2, $3, $4, $5, 'running', $6::jsonb, NOW())
     RETURNING id`,
    [
      input.runId,
      input.stepKey,
      input.stepType,
      input.stepOrder,
      input.attempt,
      JSON.stringify(input.inputData ?? {}),
    ],
  );

  return result.rows[0].id as string;
}

export async function completeStep(
  pool: pg.Pool,
  stepId: string,
  outputData: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `UPDATE workflow_steps
     SET status = 'completed', output_data = $2::jsonb, finished_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [stepId, JSON.stringify(outputData)],
  );
}

export async function failStep(
  pool: pg.Pool,
  stepId: string,
  errorMessage: string,
): Promise<void> {
  await pool.query(
    `UPDATE workflow_steps
     SET status = 'failed',
         error_data = $2::jsonb,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [
      stepId,
      JSON.stringify({ error: errorMessage }),
    ],
  );
}

export async function completeRun(pool: pg.Pool, runId: string): Promise<void> {
  await pool.query(
    `UPDATE workflow_runs
     SET status = 'completed', finished_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [runId],
  );
}

export async function failRun(pool: pg.Pool, runId: string, errorMessage: string): Promise<void> {
  await pool.query(
    `UPDATE workflow_runs
     SET status = 'failed',
         last_error = $2,
         finished_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [runId, errorMessage],
  );
}
