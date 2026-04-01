import type pg from 'pg';
import { decrypt } from '../config/encryption.js';
import { getCrmAdapter } from './crm-adapter.js';
import { fetchLead, type NormalizedLead } from './facebook.js';
import {
  completeRun,
  completeStep,
  createStep,
  failRun,
  failStep,
  startWorkflowRun,
} from './workflow-runtime.js';

interface IntegrationForDispatch {
  id: string;
  user_id: string;
  source_page_access_token: string | null;
  dest_type: string;
  dest_credentials: string;
  field_mapping: Record<string, string>;
}

interface WorkflowActionDefinition {
  type: string;
}

interface DispatchWorkflowInput {
  pool: pg.Pool;
  userId: string;
  workflowId: string;
  workflowVersionId: string;
  definition: Record<string, unknown>;
  sourceConfig: Record<string, unknown>;
  triggerEventId: string;
  sourceRef: string;
  context: Record<string, unknown>;
}

export interface DispatchWorkflowResult {
  runId: string;
  status: 'completed';
  stepsExecuted: number;
}

function parseActions(definition: Record<string, unknown>): WorkflowActionDefinition[] {
  const actionsRaw = definition['actions'];
  if (!Array.isArray(actionsRaw) || actionsRaw.length === 0) {
    throw new Error('Workflow definition actions bo\'sh');
  }

  const actions: WorkflowActionDefinition[] = [];
  for (const action of actionsRaw) {
    if (!action || typeof action !== 'object') {
      throw new Error('Workflow action noto\'g\'ri formatda');
    }
    const typeValue = (action as Record<string, unknown>)['type'];
    if (typeof typeValue !== 'string' || typeValue.trim().length === 0) {
      throw new Error('Workflow action type kiritilishi shart');
    }
    actions.push({ type: typeValue.trim() });
  }

  return actions;
}

async function getDispatchIntegration(
  pool: pg.Pool,
  userId: string,
  sourceConfig: Record<string, unknown>,
): Promise<IntegrationForDispatch> {
  const integrationId = sourceConfig['integration_id'];
  if (typeof integrationId !== 'string' || integrationId.length === 0) {
    throw new Error('Workflow source_config.integration_id topilmadi');
  }

  const result = await pool.query(
    `SELECT id, user_id, source_page_access_token, dest_type, dest_credentials, field_mapping
     FROM integrations
     WHERE id = $1 AND user_id = $2 AND active = true`,
    [integrationId, userId],
  );

  if (result.rows.length === 0) {
    throw new Error('Dispatch uchun integratsiya topilmadi yoki aktiv emas');
  }

  return result.rows[0] as IntegrationForDispatch;
}

async function fetchLeadForDispatch(
  integration: IntegrationForDispatch,
  triggerEventId: string,
  sourceRef: string,
): Promise<NormalizedLead> {
  const pageAccessToken = integration.source_page_access_token
    ? decrypt(integration.source_page_access_token)
    : null;

  if (!pageAccessToken) {
    throw new Error('Dispatch uchun source_page_access_token o\'rnatilmagan');
  }

  const lead = await fetchLead(triggerEventId, pageAccessToken);
  if (!lead.pageId) {
    lead.pageId = sourceRef;
  }
  return lead;
}

function parseActionType(actionType: string): { crmType: string; operation: string } {
  const [crmType, operation] = actionType.split('.', 2);
  if (!crmType || !operation) {
    throw new Error(`Workflow action type noto\'g\'ri: ${actionType}`);
  }
  return { crmType, operation };
}

export async function dispatchPublishedWorkflow(
  input: DispatchWorkflowInput,
): Promise<DispatchWorkflowResult> {
  const {
    pool,
    userId,
    workflowId,
    workflowVersionId,
    definition,
    sourceConfig,
    triggerEventId,
    sourceRef,
    context,
  } = input;

  const actions = parseActions(definition);
  const integration = await getDispatchIntegration(pool, userId, sourceConfig);

  const run = await startWorkflowRun(pool, {
    workflowId,
    workflowVersionId,
    triggerEventId,
    sourceRef,
    attempts: 1,
    context,
  });

  let leadData: NormalizedLead | null = null;
  let executedSteps = 1;

  try {
    leadData = await fetchLeadForDispatch(integration, triggerEventId, sourceRef);

    await completeStep(pool, run.triggerStepId, {
      leadgen_id: leadData.id,
      page_id: leadData.pageId,
      form_id: leadData.formId,
    });

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      const stepOrder = index + 2;
      const actionStepId = await createStep(pool, {
        runId: run.runId,
        stepKey: `action.${action.type}`,
        stepType: 'action',
        stepOrder,
        attempt: 1,
        inputData: {
          action_type: action.type,
          trigger_event_id: triggerEventId,
        },
      });

      try {
        const { crmType, operation } = parseActionType(action.type);
        if (operation !== 'create_lead') {
          throw new Error(`Qo\'llab-quvvatlanmagan workflow action operation: ${operation}`);
        }
        if (crmType !== integration.dest_type) {
          throw new Error(
            `Action CRM turi (${crmType}) integratsiya dest_type (${integration.dest_type}) bilan mos emas`,
          );
        }

        const adapter = await getCrmAdapter(integration.dest_type, decrypt(integration.dest_credentials));
        const result = await adapter.deliver(leadData, integration.field_mapping ?? {});

        await completeStep(pool, actionStepId, {
          crm_type: result.crmType,
          crm_lead_id: result.crmLeadId,
          success: true,
        });
        executedSteps += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown workflow action error';
        await failStep(pool, actionStepId, message);
        throw err;
      }
    }

    await completeRun(pool, run.runId);
    return {
      runId: run.runId,
      status: 'completed',
      stepsExecuted: executedSteps,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown workflow dispatch error';
    await failRun(pool, run.runId, message);
    throw err;
  }
}
