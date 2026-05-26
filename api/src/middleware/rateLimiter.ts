import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../errors/AppError';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

const WINDOW_SECONDS = 900;
const MAX_REQUESTS = 100;

export const rateLimiter = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  const ip = req.ip ?? 'unknown';
  const key = `rate:${ip}`;

  let count: number;
  try {
    count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, WINDOW_SECONDS);
    }
  } catch (err) {
    // Fail-open: a Redis outage must not block all auth traffic.
    // The trade-off — an attacker who can knock out Redis bypasses the rate limit —
    // is acceptable for the auth surface because the bcrypt cost and the global
    // brute-force protections (Day 11+) still apply.
    logger.warn({ err, ip }, 'rate limiter fail-open: Redis unreachable');
    next();
    return;
  }

  if (count > MAX_REQUESTS) {
    next(new AppError('Too many requests', 429, 'RATE_LIMIT_EXCEEDED'));
    return;
  }

  next();
};
