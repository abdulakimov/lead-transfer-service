import { ConnectionOptions } from 'bullmq';
import { getEnv } from '../config/env.js';

export function getRedisConnection(): ConnectionOptions {
  const url = new URL(getEnv().REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
  };
}
