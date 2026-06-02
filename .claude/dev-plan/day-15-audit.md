# Day 15 — Security Gate Audit Report

Date run: 2026-05-27
Stack state: all five Docker services up (`api`, `worker`, `db`, `redis`, `nginx`); test stack `flowboard-test` operational.

## Scorecard

| Section | Status | Notes |
| :-- | :-- | :-- |
| §5.1 Repository + build | PASS | 12 day-NN + 2 week-* commits; tsc clean; no plaintext secrets; .env.example is a superset of `env.ts` |
| §5.2 Auth + authorization | PASS | bcrypt cost 12; access 15m / refresh 7d; rotation, replay 401, logout 204 all end-to-end |
| §5.3 Input validation | PASS | 7 `.strict()` schemas; 3 UUID path params; invalid body → 422; zero `...req.body` spreads |
| §5.4 Security middleware | PASS | Helmet headers; 15 kB → 413; CORS forbidden origin omits Allow-Origin; prod NO-stack + NO-details tests green; rate limiter 429; LOGIN_LOCKED 429 |
| §5.5 Redis observables + fail-open | PASS | `rate:*` populates; `refresh:*` TTL ≈ 603191 s; `XLEN tasks:events` ticks on mutation; Redis stopped → `/auth/login` returns 401 (not 500) |
| §5.6 Worker + DLQ | PASS | `audit-group` consumer; XPENDING = 0; 7 AuditLog rows; injected bad event → 3 retries → DLQ; DLQ documented in `ai-context.md` |
| §5.7 Tests + coverage | PASS | 80/80 tests across 14 suites; coverage 98.21% / 93.4% / 96.07% / 98.3% (all > 80 gate) |
| §5.8 Observability + redaction | PASS | `/health` returns uptime; `/ready` flips 200 ↔ 503 on Redis stop/start; pino-http log shows only `{ method, url, id }` and `{ statusCode }`; grep for plaintext secrets in logs returns nothing |

No gaps surfaced. No code changes required for Day 15.

## Evidence (commands run)

### §5.1
- `git log --oneline | grep ^[a-f0-9]+ (day-|week-)` — 14 commits to date (Day 15 will be the 15th).
- `docker compose ps` — all five services Up.
- `cd api && npx tsc --noEmit` — exit 0, no output.
- `grep -rnE "(secret|password|token)\s*[:=]\s*['"][^'"]+['"]" api/src worker/src` — no hits.
- `.env.example` vs `env.ts` reads — every key in `env.ts` (NODE_ENV, PORT, LOG_LEVEL, DATABASE_URL, REDIS_URL, JWT_*, ALLOWED_ORIGINS) is documented; `.env.example` also documents NGINX_PORT and POSTGRES_* (Compose-only vars, expected).

### §5.2
- End-to-end script: register 201 → login 200 → refresh rotates RT → replay 401 → logout 204 → `GET /boards` no token 401 → `GET /tasks/<uuid>` no token 401.

### §5.3
- `grep ...req.body` and `data: { ...` across `api/src` — zero hits.
- 7 `.strict()` total: `auth.ts` 4 (Register/Login/Refresh/Logout), `task.ts` 2 (CreateTask/UpdateTask), `board.ts` 1 (CreateBoard).
- UUID path params: `BoardIdParam.id`, `TaskIdParam.id`, `CreateTaskSchema.boardId`.
- `POST /auth/register` with invalid body → 422 with `VALIDATION_ERROR` and field details (dev only).

### §5.4
- `curl -D - /api/health` → `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-DNS-Prefetch-Control: off`, `Strict-Transport-Security: max-age=15552000; includeSubDomains`.
- 15 kB body → HTTP 413.
- `OPTIONS /boards` from `Origin: https://evil.example.com` → 0 `Access-Control-Allow-Origin` headers.
- `tests/errorHandler.test.ts`: both `NODE_ENV=production` tests pass (no `stack`, no `details`, body keys exactly `[code, message, success]`).
- `tests/loginThrottle.test.ts`: 10 × 401 then 11th = 429 `LOGIN_LOCKED`; success clears counter.
- `tests/rateLimiter.test.ts`: 100 × 422 then 101st = 429 `RATE_LIMIT_EXCEEDED`.

### §5.5
- `redis-cli KEYS rate:*` → `rate:192.168.65.1` after a login probe.
- `redis-cli KEYS refresh:*` → 10 keys with `refresh:{userId}:{tokenId}` format.
- `EVAL "TTL on first refresh key"` → `(integer) 603191` (≈ 6.98 days, within ~25 min of 604800 ceiling).
- `XLEN tasks:events` before mutation = 1, after `POST /tasks` = 2.
- `docker compose stop redis` → `curl /api/auth/login` returns 401 (auth handler answered), confirming fail-open.

### §5.6
- `XINFO GROUPS tasks:events` → group `audit-group`, consumers 1, pending 0, lag 0.
- Injected bad event (`XADD tasks:events * action CREATED entity Task entityId not-a-uuid`) → 3 `audit handler failed; will retry` log lines → DLQ XLEN incremented by 1.
- `XPENDING tasks:events audit-group` → 0 (XACK firing after success and after DLQ move).
- `SELECT COUNT(*) FROM "AuditLog"` → 7 rows.
- DLQ subsection in `ai-context.md` documents `action / entity / entityId / userId / occurredAt / errorMessage / failedAt`.

### §5.7
- `docker compose -f docker-compose.test.yml exec api npx jest --coverage` — Test Suites 14 passed, Tests 80 passed.
- Final table: 98.21% stmts / 93.4% branches / 96.07% funcs / 98.3% lines.
- Required auth cases all present in `tests/auth.test.ts`; rate-limit 429 in `tests/rateLimiter.test.ts`; LOGIN_LOCKED 429 in `tests/loginThrottle.test.ts`.

### §5.8
- `GET /api/health` → `{ status: 'ok', uptime: 946.12 }`.
- `GET /api/ready` (both up) → 200 `{ status: 'ready', db: 'ok', redis: 'ok' }`.
- `docker compose stop redis` + `GET /api/ready` → 503 `{ code: 'NOT_READY' }`; restart → 200.
- pino-http log line shows only `req: { method, url, id }` and `res: { statusCode }` — Authorization header and request body are structurally absent.
- Direct grep for `hunter2-very-secret` / `should-not-leak-xxxxxx` in `docker compose logs api` returns nothing.

## End-to-end walkthrough — `PATCH /tasks/:id`

1. Nginx :80 receives the request and proxies to `api:3000` via the `upstream api_upstream` block, forwarding `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`.
2. `app.set('trust proxy', 1)` makes `req.ip` the real client IP from `X-Forwarded-For`.
3. `helmet()` writes security headers; `cors({ origin: ALLOWED_ORIGINS })` validates the origin; `express.json({ limit: '10kb' })` parses the body or fires 413 via the `entity.too.large` branch in `globalErrorHandler`.
4. `pino-http` opens a log scope showing only `{ method, url, id }` — body never enters the log line.
5. `authenticate` parses `Authorization: Bearer ...`, verifies the JWT with `JWT_ACCESS_SECRET`, attaches `req.user = { id: payload.sub }`. No Redis/DB call.
6. Handler `updateTask` runs: `TaskIdParam.parse(req.params)` enforces UUID; `UpdateTaskSchema.parse(req.body)` enforces `.strict()` (extras → 422).
7. `loadOwnedTask(id, user.id)`: single Prisma query selecting `board: { select: { ownerId: true } }`. On mismatch in a write context → 403 `FORBIDDEN`. On read context the mismatch collapses into 404 `TASK_NOT_FOUND` (Authorization Leak Policy in `ai-context.md`).
8. `prisma.task.update({ where: { id }, data: { ...whitelisted fields } })`.
9. `publishTaskEvent({ action: 'UPDATED', entityId, userId })` → `XADD tasks:events MAXLEN ~ 10000 * action ... entity Task entityId ... userId ... occurredAt <ISO>`. On Redis error: logger.error and swallow (the DB has already committed).
10. Response `{ success: true, data: task }` returned. pino-http closes the log line at info / warn / error per status.
11. Worker (separate process) blocks on `XREADGROUP GROUP audit-group worker-1 COUNT 10 BLOCK 5000 STREAMS tasks:events >`. Receives the entry, calls `parseTaskEvent` (Zod-validates the flat KV pairs), runs `handleTaskEvent` which does `prisma.auditLog.create({ data: { userId, action, entity, entityId } })`, then `XACK tasks:events audit-group <id>`.
12. On 3 retries failing (delays 100 / 500 / 2000 ms), worker `XADD tasks:events:dlq <original fields> errorMessage <msg> failedAt <ISO>` and `XACK` the original so it does not loop in the PEL.

## Outcome

Security Gate self-review complete. Ready for `week-03 complete: OWASP hardening, production patterns, Security Gate ready` commit and trainer notification.
