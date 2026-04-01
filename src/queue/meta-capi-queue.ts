import { Queue } from 'bullmq';
import { getRedisConnection } from './connection.js';

export interface MetaCapiJobData {
  eventId: string;
}

let queue: Queue<MetaCapiJobData> | null = null;

export function getMetaCapiQueue(): Queue<MetaCapiJobData> {
  if (!queue) {
    queue = new Queue<MetaCapiJobData>('meta-capi-processing', {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 2000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return queue;
}

export async function addMetaCapiJob(data: MetaCapiJobData): Promise<string> {
  const job = await getMetaCapiQueue().add('process-meta-capi-event', data, {
    jobId: `meta-capi-${data.eventId}`,
    attempts: 5,
    backoff: {
      type: 'custom',
    },
  });
  return job.id!;
}
