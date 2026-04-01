import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export interface LeadJobData {
  leadgenId: string;
  pageId: string;
  integrationId: string;
  adId?: string;
  formId?: string;
  createdTime?: number;
  sourceType?: 'facebook' | 'google_forms';
  sourcePayload?: Record<string, unknown>;
}

let queue: Queue<LeadJobData> | null = null;

export function getLeadQueue(): Queue<LeadJobData> {
  if (!queue) {
    queue = new Queue<LeadJobData>('lead-processing', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

export async function addLeadJob(data: LeadJobData): Promise<string> {
  const job = await getLeadQueue().add('process-lead', data, {
    jobId: `lead-${data.leadgenId}`,
    attempts: 5,
    backoff: {
      type: 'custom',
    },
  });
  return job.id!;
}
