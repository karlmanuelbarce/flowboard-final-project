# Day 6 — Redis Client and Rate Limiter

## Task

- `api/src/lib/redis.ts` exports an `ioredis` client wired to env vars.
- `rateLimiter` middleware uses Redis `INCR` + `EXPIRE`; applied to `POST /auth/login` and `POST /auth/register` only.
- 101st request inside the window returns `429` with code `RATE_LIMIT_EXCEEDED`.
- If Redis is unreachable, the rate limiter **fails open** (logs a warning, calls `next()`).

## Dev Plan

**Files**
- `api/src/lib/redis.ts`
- `api/src/middleware/rateLimiter.ts`

**Redis client**
```ts
const redis = new Redis({
  host: process.env.REDIS_HOST ?? 'redis',
  port: Number(process.env.REDIS_PORT ?? 6379),
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});
redis.on('error', (err) => logger.error({ err }, 'redis error'));
```

**Rate limiter**
- Window: 15 min (`WINDOW_SECONDS = 900`).
- Max: 100 per IP.
- Key: `rate:{ip}`.
- Flow: `INCR` → if result === 1, `EXPIRE key WINDOW_SECONDS` → if result > MAX, throw `AppError(429, 'RATE_LIMIT_EXCEEDED')`.
- Wrap the Redis calls in try/catch — on failure, `logger.warn({ err }, 'rate limiter fail-open')` and `next()`.

**Edge cases**
- `req.ip` is undefined when `trust proxy` is unset — set `app.set('trust proxy', 1)` (will be done formally Day 11; minimum requirement now is that `req.ip` returns a usable string).
- Counter race between two concurrent first requests — `INCR` is atomic; the `EXPIRE` on result===1 is safe (worst case, the TTL is set twice).

**Verify**
- Loop 101 `POST /auth/login` requests; request 101 returns 429.
- Stop the Redis container, hit `/auth/login` — the API still responds (does not 500) and a warning is logged.

## Commit

`day-06: Redis client, rate limiter middleware`

## Workflow Prompt

```
/workflow Day 6 — Stand up the Redis client and a fail-open rate limiter for /auth/login and /auth/register.

Deliverables:
1. api/src/lib/redis.ts: ioredis client reading REDIS_HOST/REDIS_PORT from env. maxRetriesPerRequest: 1, enableOfflineQueue: false. Log connection errors via Pino (use console.error if Pino is not yet in place — replace on Day 13).
2. api/src/middleware/rateLimiter.ts: window 900s, max 100/IP, key `rate:{ip}`. INCR; if result === 1 set EXPIRE; if result > 100 throw AppError(429, 'RATE_LIMIT_EXCEEDED').
3. Wrap the Redis interactions in try/catch — on any Redis error, log a warning and call next() (fail open). This is the agreed safer production behavior because a Redis outage should not block all auth traffic.
4. Apply rateLimiter to POST /auth/login and POST /auth/register only.
5. Confirm req.ip returns a usable string in the dev container (Nginx is in front; `app.set('trust proxy', 1)` gets formalized Day 11 — if req.ip is undefined, set trust proxy now).

Verify: a loop of 101 login requests; request 101 returns 429. Stop redis container; /auth/login still responds 200/401 (not 500).

Follow ai-context.md. Use AppError + next(err), never res.status().json() in catch.
```
