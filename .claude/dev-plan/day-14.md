# Day 14 — Health Checks, DLQ Documentation

## Task

- `GET /health` returns 200 with uptime — liveness only.
- `GET /ready` returns 200 when PostgreSQL and Redis are reachable, 503 when either is down.
- DLQ key format (`tasks:events:dlq`) documented in `ai-context.md`.

## Dev Plan

**Files**
- `api/src/routes/health.ts`
- Update `api/src/app.ts` — mount health router **before** `authenticate` (these endpoints must be public).
- Update `ai-context.md` — add a "Dead-Letter Queue" subsection.

**Handlers**
```ts
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

router.get('/ready', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.ping();
    res.json({ status: 'ready', db: 'ok', redis: 'ok' });
  } catch (err) {
    next(new AppError('Service not ready', 503, 'NOT_READY'));
  }
});
```

**DLQ doc update for `ai-context.md`**
```
### Dead-Letter Queue
Stream key: tasks:events:dlq
Fields: action, taskId, userId, payload (JSON), ts, reason
Move policy: after 3 processing failures of the same stream id (tracked via the
`tasks:events:attempts` hash with 1h TTL), XADD the original fields + a `reason`
to tasks:events:dlq, then XACK the main stream.
Inspection: `redis-cli XRANGE tasks:events:dlq - + COUNT 50`.
```

**Edge cases**
- `/ready` must short-circuit — do not run auth on it (LB/k8s probes have no token).
- A long-running Prisma query should not delay `/health`. `/health` uses no I/O.
- Timeouts: `/ready` should not hang indefinitely if Redis is partitioned. Wrap `redis.ping()` in a 1-2s timeout; on timeout return 503.

**Verify**
- `GET /health` → 200 with `{ status: 'ok', uptime: <number> }`.
- `docker compose stop redis`; `GET /ready` → 503 with code `NOT_READY`.
- `docker compose start redis`; `GET /ready` → 200.
- `ai-context.md` updated and committed.

## Commit

`day-14: health checks, DLQ documentation`

## Workflow Prompt

```
/workflow Day 14 — Health/readiness endpoints and dead-letter-queue documentation.

Deliverables:
1. api/src/routes/health.ts: GET /health (uptime only, no I/O), GET /ready (await prisma.$queryRaw`SELECT 1` and redis.ping() with a 1-2s timeout; on failure call next(new AppError('Service not ready', 503, 'NOT_READY'))).
2. Mount the health router in api/src/app.ts BEFORE the authenticate middleware so probes do not need a token.
3. Update ai-context.md with a new "Dead-Letter Queue" subsection: key `tasks:events:dlq`, fields (action, taskId, userId, payload, ts, reason), move policy (3 failed attempts tracked in `tasks:events:attempts`), inspection command (XRANGE).
4. Add tests: /health returns 200, /ready returns 200 when both deps up, /ready returns 503 when Redis is stopped (mock the ping rejection in the test rather than actually stopping Redis).

Verify manually: docker compose stop redis → GET /ready returns 503. Start it again → 200.

Follow ai-context.md.
```
