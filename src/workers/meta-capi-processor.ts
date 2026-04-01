import { Worker, Job } from 'bullmq';
import { getRedisConnection } from '../queue/connection.js';
import { RETRY_DELAYS } from '../config/constants.js';
import { getPool } from '../db/pool.js';
import { decrypt } from '../config/encryption.js';
import { sendMetaConversionEvent } from '../services/meta-conversions.js';
import { MetaCapiError } from '../services/errors.js';
import { formatErrorForLog } from '../utils/log-sanitize.js';
import type { MetaCapiJobData } from '../queue/meta-capi-queue.js';

interface CapiEventRow {
  id: string;
  user_id: string;
  config_id: string;
  event_name: string;
  event_time: string;
  event_id: string;
  action_source: string;
  event_source_url: string | null;
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
  status: string;
  attempts: number;
}

interface CapiConfigRow {
  id: string;
  pixel_id: string;
  access_token: string;
  test_event_code: string | null;
  active: boolean;
}

async function processMetaCapiEvent(job: Job<MetaCapiJobData>): Promise<void> {
  const pool = getPool();
  const eventId = job.data.eventId;

  const eventResult = await pool.query(
    `SELECT id, user_id, config_id, event_name, event_time, event_id, action_source, event_source_url,
            user_data, custom_data, status, attempts
     FROM meta_capi_events
     WHERE id = $1
     LIMIT 1`,
    [eventId],
  );

  if (eventResult.rows.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(`[meta-capi:worker] event topilmadi event_id=${eventId}`);
    return;
  }

  const event = eventResult.rows[0] as CapiEventRow;
  if (event.status === 'delivered') {
    // eslint-disable-next-line no-console
    console.log(`[meta-capi:worker] skip, allaqachon delivered event_id=${eventId}`);
    return;
  }

  await pool.query(
    `UPDATE meta_capi_events
     SET status = 'processing',
         attempts = attempts + 1,
         updated_at = NOW()
     WHERE id = $1`,
    [eventId],
  );

  const configResult = await pool.query(
    `SELECT id, pixel_id, access_token, test_event_code, active
     FROM meta_capi_configs
     WHERE id = $1
     LIMIT 1`,
    [event.config_id],
  );

  if (configResult.rows.length === 0) {
    throw new Error(`Meta CAPI config topilmadi: ${event.config_id}`);
  }

  const config = configResult.rows[0] as CapiConfigRow;
  if (!config.active) {
    throw new MetaCapiError('Meta CAPI config o\'chirilgan', 400);
  }

  const accessToken = decrypt(config.access_token);
  const testEventCode = config.test_event_code ? decrypt(config.test_event_code) : null;

  const responseBody = await sendMetaConversionEvent({
    pixelId: config.pixel_id,
    accessToken,
    testEventCode,
    event: {
      eventName: event.event_name,
      eventId: event.event_id,
      eventTime: new Date(event.event_time),
      actionSource: event.action_source as
        | 'website'
        | 'app'
        | 'phone_call'
        | 'chat'
        | 'physical_store'
        | 'system_generated'
        | 'business_messaging'
        | 'other',
      eventSourceUrl: event.event_source_url,
      userData: event.user_data ?? {},
      customData: event.custom_data ?? {},
    },
  });

  await pool.query(
    `UPDATE meta_capi_events
     SET status = 'delivered',
         fb_response = $2::jsonb,
         delivered_at = NOW(),
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [eventId, JSON.stringify(responseBody)],
  );

  // eslint-disable-next-line no-console
  console.log(`[meta-capi:worker] delivered event_id=${eventId} event_name=${event.event_name}`);
}

export function startMetaCapiWorker() {
  const worker = new Worker<MetaCapiJobData>(
    'meta-capi-processing',
    processMetaCapiEvent,
    {
      connection: getRedisConnection(),
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          if (attemptsMade <= RETRY_DELAYS.length) {
            return RETRY_DELAYS[attemptsMade - 1];
          }
          return -1;
        },
      },
    },
  );

  worker.on('failed', async (job, err) => {
    if (!job) return;
    const pool = getPool();

    const nonRetryable = err instanceof MetaCapiError && !err.retryable;
    const isDlq = job.attemptsMade >= 5 || nonRetryable;
    const status = isDlq ? 'dlq' : 'failed';

    await pool.query(
      `UPDATE meta_capi_events
       SET status = $1,
           last_error = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [status, err.message, job.data.eventId],
    );

    // eslint-disable-next-line no-console
    console.error(`[meta-capi:worker] event=${job.data.eventId} status=${status} error=${formatErrorForLog(err)}`);
  });

  // eslint-disable-next-line no-console
  console.log('Meta CAPI worker ishga tushirildi');
  return worker;
}
