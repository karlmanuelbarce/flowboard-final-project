import { AppError } from '../errors/AppError';
import { logger } from './logger';
import { redis } from './redis';

const WINDOW_SECONDS = 60;
const MAX_FAILURES = 10;

const keyForEmail = (email: string): string => `login:fail:email:${email.toLowerCase()}`;
const keyForIp = (ip: string): string => `login:fail:ip:${ip}`;

export interface LoginAttemptId {
  email: string;
  ip: string;
}

// Read both counters; if either is at or above the limit, throw 429.
// Fails open on a Redis error — the global rate limiter (Day 6) still applies, and
// blocking all logins because Redis is down would be a self-inflicted outage.
export const assertNotLocked = async ({
  email,
  ip,
}: LoginAttemptId): Promise<void> => {
  try {
    const [emailHits, ipHits] = await Promise.all([
      redis.get(keyForEmail(email)),
      redis.get(keyForIp(ip)),
    ]);
    const emailCount = Number.parseInt(emailHits ?? '0', 10);
    const ipCount = Number.parseInt(ipHits ?? '0', 10);
    if (emailCount >= MAX_FAILURES || ipCount >= MAX_FAILURES) {
      throw new AppError(
        'Too many failed login attempts; try again in a minute',
        429,
        'LOGIN_LOCKED',
      );
    }
  } catch (err) {
    // Re-raise AppError; swallow only Redis transport errors.
    if (err instanceof AppError) throw err;
    logger.warn({ err, email, ip }, 'loginThrottle fail-open: Redis unreachable on read');
  }
};

const bumpCounter = async (key: string): Promise<void> => {
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW_SECONDS);
  }
};

export const registerFailedLogin = async ({
  email,
  ip,
}: LoginAttemptId): Promise<void> => {
  try {
    await Promise.all([bumpCounter(keyForEmail(email)), bumpCounter(keyForIp(ip))]);
  } catch (err) {
    logger.warn({ err, email, ip }, 'loginThrottle fail-open: Redis unreachable on write');
  }
};

export const clearLoginFailures = async ({
  email,
  ip,
}: LoginAttemptId): Promise<void> => {
  try {
    await Promise.all([redis.del(keyForEmail(email)), redis.del(keyForIp(ip))]);
  } catch (err) {
    logger.warn({ err, email, ip }, 'loginThrottle fail-open: Redis unreachable on clear');
  }
};
