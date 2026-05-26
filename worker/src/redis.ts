import Redis from 'ioredis';

import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  logger.fatal('REDIS_URL is required');
  process.exit(1);
}

// Worker uses default ioredis retry policy — we WANT it to keep retrying so the
// consumer loop survives transient Redis blips. Unlike the API rate limiter, we
// can block on Redis here; there is no end-user request waiting on us.
export const redis: Redis = new Redis(REDIS_URL);

redis.on('error', (err: Error): void => {
  logger.error({ err: { message: err.message, name: err.name } }, 'redis error');
});

redis.on('connect', (): void => {
  logger.info('redis connected');
});
