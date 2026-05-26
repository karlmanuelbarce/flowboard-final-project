import Redis from 'ioredis';

import { env } from './env';
import { logger } from './logger';

// ioredis lazily connects, so module load does not require Redis to be reachable.
// maxRetriesPerRequest: 1 + enableOfflineQueue: false means a single Redis call fails
// fast when Redis is unreachable, instead of hanging the request — required for the
// rate limiter's fail-open behavior to kick in promptly.
export const redis: Redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  lazyConnect: false,
});

/* istanbul ignore next -- event handlers fire on transport-level events, not via test calls */
redis.on('error', (err: Error): void => {
  logger.error({ err: { message: err.message, name: err.name } }, 'redis error');
});

/* istanbul ignore next -- event handlers fire on transport-level events, not via test calls */
redis.on('connect', (): void => {
  logger.info('redis connected');
});
