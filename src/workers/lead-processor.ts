import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../queue/connection.js';
import { RETRY_DELAYS, LEAD_STATUS } from '../config/constants.js';
import { getPool } from '../db/pool.js';
import { decrypt, encrypt } from '../config/encryption.js';
import { fetchLead } from '../services/facebook.js';
import { normalizeGoogleFormsLead } from '../services/google-forms.js';
import { DuplicateLeadError, FacebookAuthError } from '../services/errors.js';
import { getCrmAdapter } from '../services/crm-adapter.js';
import { sendTelegramMessage, formatLeadNotification } from '../services/telegram.js';
import { loadEnv } from '../config/env.js';
import type { LeadJobData } from '../queue/lead-queue.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';
import {
  ensurePublishedWorkflowVersion,
  startWorkflowRun,
  createStep,
  completeStep,
  failStep,
  completeRun,
  failRun,
} from '../services/workflow-runtime.js';

export interface IntegrationRow {
  id: string;
  user_id: string;
  source_type: string;
  source_page_id: string | null;
  source_page_access_token: string | null;
  source_form_id: string | null;
  dest_type: string;
  dest_credentials: string;
  field_mapping: Record<string, string>;
  dedup_enabled: boolean;
  dedup_field: 'phone' | 'email';
  notify_telegram_chat_id: string | null;
  name: string;
}

function extractFacebookPageToken(credentialsJson: string, targetPageId: string): string | null {
  try {
    const credentials = JSON.parse(decrypt(credentialsJson)) as {
      pages?: Array<{ id?: string; access_token?: string }>;
    };
    const pages = Array.isArray(credentials.pages) ? credentials.pages : [];
    const page = pages.find((item) => item.id === targetPageId);
    if (!page?.access_token) return null;
    return page.access_token;
  } catch {
    return null;
  }
}

async function findLatestFacebookPageToken(userId: string, pageId: string): Promise<string | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT credentials
     FROM connections
     WHERE user_id = $1 AND provider = 'facebook'
     ORDER BY updated_at DESC`,
    [userId],
  );

  for (const row of result.rows) {
    const token = extractFacebookPageToken(String(row.credentials), pageId);
    if (token) return token;
  }
  return null;
}

export async function processLead(job: Job<LeadJobData>) {
  const { leadgenId, integrationId, pageId } = job.data;
  const pool = getPool();

  let workflowRunId: string | null = null;
  let triggerStepId: string | null = null;
  let actionStepId: string | null = null;

  try {
    // Idempotency guard: if this lead is already delivered, never deliver again.
    const existingLeadResult = await pool.query(
      `SELECT status FROM leads WHERE leadgen_id = $1 LIMIT 1`,
      [leadgenId],
    );
    if (existingLeadResult.rows[0]?.status === LEAD_STATUS.DELIVERED) {
      // eslint-disable-next-line no-console
      console.log(`[lead-worker] skip qilindi: lead allaqachon yetkazilgan leadgen_id=${leadgenId}`);
      return;
    }

    // 1. Mark as processing
    await pool.query(
      `UPDATE leads SET status = $1, attempts = attempts + 1, updated_at = NOW() WHERE leadgen_id = $2`,
      [LEAD_STATUS.PROCESSING, leadgenId],
    );

    // 2. Fetch integration config
    const intResult = await pool.query(
      `SELECT id, user_id, name, source_type, source_page_id, source_page_access_token, source_form_id, dest_type, dest_credentials,
              field_mapping, dedup_enabled, dedup_field, notify_telegram_chat_id
       FROM integrations WHERE id = $1`,
      [integrationId],
    );

    if (intResult.rows.length === 0) {
      throw new Error(`Integratsiya topilmadi: ${integrationId}`);
    }

    const integration = intResult.rows[0] as IntegrationRow;

    // 3. Start minimal workflow runtime execution trace
    const workflowRef = await ensurePublishedWorkflowVersion(pool, {
      userId: integration.user_id,
      integrationId,
      destType: integration.dest_type,
    });
    const workflowRun = await startWorkflowRun(pool, {
      workflowId: workflowRef.workflowId,
      workflowVersionId: workflowRef.workflowVersionId,
      triggerEventId: leadgenId,
      sourceRef: pageId,
      attempts: job.attemptsMade + 1,
      context: {
        leadgen_id: leadgenId,
        integration_id: integrationId,
        page_id: pageId,
        form_id: job.data.formId ?? null,
      },
    });
    workflowRunId = workflowRun.runId;
    triggerStepId = workflowRun.triggerStepId;

    let leadData;
    if (integration.source_type === 'google_forms') {
      const payload = (job.data.sourcePayload as Record<string, unknown> | undefined) ?? (
        await pool.query('SELECT raw_data FROM leads WHERE leadgen_id = $1 LIMIT 1', [leadgenId])
      ).rows[0]?.raw_data as Record<string, unknown> | undefined;
      leadData = normalizeGoogleFormsLead(
        leadgenId,
        integration.source_form_id ?? job.data.formId ?? pageId ?? null,
        payload ?? {},
      );
      // eslint-disable-next-line no-console
      console.log(`[lead-worker] google forms lead tayyorlandi leadgen_id=${leadgenId}`);
    } else {
      // 4. Decrypt tokens for Facebook source
      const pageAccessToken = integration.source_page_access_token
        ? decrypt(integration.source_page_access_token)
        : null;

      if (!pageAccessToken) {
        // Facebook auth failures are non-retryable until credentials are rotated.
        job.discard();
        throw new FacebookAuthError('Sahifa access token o\'rnatilmagan');
      }

      // 5. Fetch lead data from Facebook
      // eslint-disable-next-line no-console
      console.log(`[lead-worker] facebookdan lead olinmoqda leadgen_id=${leadgenId}`);
      try {
        leadData = await fetchLead(leadgenId, pageAccessToken);
        if (!leadData.pageId) {
          leadData.pageId = pageId;
        }
        // eslint-disable-next-line no-console
        console.log(`[lead-worker] facebook lead olindi leadgen_id=${leadgenId}`);
      } catch (err) {
        if (err instanceof FacebookAuthError) {
          const fallbackPageId = integration.source_page_id ?? pageId;
          if (fallbackPageId) {
            const latestPageToken = await findLatestFacebookPageToken(integration.user_id, fallbackPageId);
            if (latestPageToken && latestPageToken !== pageAccessToken) {
              // eslint-disable-next-line no-console
              console.warn(`[lead-worker] token yangilandi integration_id=${integration.id} page_id=${fallbackPageId}`);
              await pool.query(
                'UPDATE integrations SET source_page_access_token = $1, updated_at = NOW() WHERE id = $2',
                [encrypt(latestPageToken), integration.id],
              );
              leadData = await fetchLead(leadgenId, latestPageToken);
              if (!leadData.pageId) {
                leadData.pageId = pageId;
              }
              // eslint-disable-next-line no-console
              console.log(`[lead-worker] facebook lead olindi (fallback token) leadgen_id=${leadgenId}`);
            } else {
              // Stop BullMQ retries for expired/invalid token scenarios when no fresh token exists.
              job.discard();
            }
          } else {
            job.discard();
          }
        }
        if (err instanceof Error && /"error_subcode":33/.test(err.message)) {
          // Lead object this app/page token cannot access (usually app/context mismatch).
          job.discard();
        }
        // eslint-disable-next-line no-console
        if (!leadData) {
          console.error(`[lead-worker] facebook lead olinmadi leadgen_id=${leadgenId}: ${formatErrorForLog(err)}`);
          throw err;
        }
      }
    }

    const destCredentials = decrypt(integration.dest_credentials);

    if (triggerStepId) {
      await completeStep(pool, triggerStepId, {
        leadgen_id: leadData.id,
        page_id: leadData.pageId,
        form_id: leadData.formId,
      });
    }

    // 6. Get CRM adapter
    const adapter = await getCrmAdapter(integration.dest_type, destCredentials);

    // 7. Dedup check
    const mapping = integration.field_mapping ?? {};

    if (integration.dedup_enabled && adapter.checkDuplicate) {
      const dedupValue = integration.dedup_field === 'email'
        ? leadData.email
        : leadData.phone;

      if (dedupValue) {
        try {
          await adapter.checkDuplicate(integration.dedup_field, dedupValue);
        } catch (err) {
          if (err instanceof DuplicateLeadError) {
            await pool.query(
              `UPDATE leads SET status = 'duplicate', updated_at = NOW() WHERE leadgen_id = $1`,
              [leadgenId],
            );
            if (workflowRunId) {
              await completeRun(pool, workflowRunId);
            }
            // eslint-disable-next-line no-console
            console.log(`Lead ${leadgenId} dublikat: ${err.field} = ${err.value}`);
            return;
          }
          throw err;
        }
      }
    }

    if (workflowRunId) {
      actionStepId = await createStep(pool, {
        runId: workflowRunId,
        stepKey: `action.${integration.dest_type}.create_lead`,
        stepType: 'action',
        stepOrder: 2,
        attempt: job.attemptsMade + 1,
        inputData: {
          crm_type: integration.dest_type,
          leadgen_id: leadData.id,
        },
      });
    }

    // 8. Deliver to CRM
    // eslint-disable-next-line no-console
    console.log(`[lead-worker] crmga yuborilmoqda leadgen_id=${leadgenId} crm=${integration.dest_type}`);
    let result;
    try {
      result = await adapter.deliver(leadData, mapping);
      // eslint-disable-next-line no-console
      console.log(`[lead-worker] crmga yuborish muvaffaqiyatli leadgen_id=${leadgenId} crm=${integration.dest_type}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[lead-worker] crmga yuborish xatosi leadgen_id=${leadgenId} crm=${integration.dest_type}: ${formatErrorForLog(err)}`,
      );
      throw err;
    }

    // 9. Update lead status first to reduce retry-driven duplicate deliveries.
    await pool.query(
      `UPDATE leads SET
         status = $1,
         raw_data = $2,
         mapped_data = $3,
         delivered_at = NOW(),
         updated_at = NOW()
       WHERE leadgen_id = $4`,
      [LEAD_STATUS.DELIVERED, JSON.stringify(leadData), JSON.stringify(result), leadgenId],
    );

    // 10. Best-effort observability updates must not trigger re-delivery retries.
    if (actionStepId) {
      try {
        await completeStep(pool, actionStepId, {
          crm_type: integration.dest_type,
          crm_lead_id: result.crmLeadId,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[lead-worker] completeStep xatosi leadgen_id=${leadgenId}: ${formatErrorForLog(err)}`);
      }
    }

    if (workflowRunId) {
      try {
        await completeRun(pool, workflowRunId);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[lead-worker] completeRun xatosi leadgen_id=${leadgenId}: ${formatErrorForLog(err)}`);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`Lead ${leadgenId} yetkazildi -> ${integration.dest_type} #${result.crmLeadId}`);

    // 11. Telegram notification (fire-and-forget)
    if (integration.notify_telegram_chat_id) {
      const env = loadEnv();
      if (env.TELEGRAM_BOT_TOKEN) {
        const text = formatLeadNotification(
          leadData,
          integration.name,
          integration.dest_type === 'bitrix24' ? Number(result.crmLeadId) : undefined,
        );
        sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, integration.notify_telegram_chat_id, text)
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error(`Telegram bildirishnoma yuborishda xato (lead ${leadgenId}): ${formatErrorForLog(err)}`);
          });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown workflow execution error';
    if (actionStepId) {
      await failStep(pool, actionStepId, message);
    } else if (triggerStepId) {
      await failStep(pool, triggerStepId, message);
    }
    if (workflowRunId) {
      await failRun(pool, workflowRunId, message);
    }
    throw err;
  }
}

export function startLeadWorker() {
  const worker = new Worker<LeadJobData>(
    'lead-processing',
    processLead,
    {
      connection: getRedisConnection(),
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          if (attemptsMade <= RETRY_DELAYS.length) {
            return RETRY_DELAYS[attemptsMade - 1];
          }
          return -1; // move to DLQ
        },
      },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const pool = getPool();

    // Non-retryable auth errors go straight to DLQ
    const isDlq = job.attemptsMade >= 5 || err instanceof FacebookAuthError;
    const status = isDlq ? LEAD_STATUS.DLQ : LEAD_STATUS.FAILED;

    await pool.query(
      `UPDATE leads SET status = $1, last_error = $2, updated_at = NOW() WHERE leadgen_id = $3`,
      [status, err.message, job.data.leadgenId],
    );

    // eslint-disable-next-line no-console
    console.error(
      `Lead ${job.data.leadgenId} muvaffaqiyatsiz (urinish ${job.attemptsMade}): ${formatErrorForLog(err)}`,
    );
  });

  // eslint-disable-next-line no-console
  console.log('Lead worker ishga tushirildi');
  return worker;
}
