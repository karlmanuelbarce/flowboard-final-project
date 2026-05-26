# Day 15 — Security Gate Self-Review

## Task

- Walk every item in `flowboard-project-brief.docx.md` §5 (sections 5.1–5.8). Every checkbox is ticked.
- Be able to answer end-to-end without looking at the code:
  > *"Walk me through what happens — from the moment a `PATCH /tasks/:id` request hits Nginx to the moment the AuditLog row is written."*

## Dev Plan

**Self-review by section (project brief §5)**

**5.1 Repository and Build**
- All 15 daily commits present in `git log`.
- `docker compose up` → all five services start.
- `docker compose exec api npx tsc --noEmit` → 0 errors.
- `grep -rn -E "(secret|password|token)\\s*[:=]\\s*['\"]" api/src worker/src` returns nothing concrete.
- `.env.example` lists every var actually read by the app.

**5.2 Auth**
- Bcrypt cost ≥ 12 (check the `bcrypt.hash` call).
- Access TTL 15m, refresh TTL 7d.
- Refresh rotation deletes old key, stores new key.
- Replay → 401.
- Logout deletes key.
- Every `/boards` and `/tasks` route requires Bearer.
- Cross-user access → 403 (or 404 per the leak policy doc).

**5.3 Input validation**
- Every body-accepting route has a Zod schema.
- Path IDs validated as UUID.
- Invalid body → 422 with descriptive message.
- No `...req.body` spreads.
- Schemas use `.strict()` — extras stripped or rejected.

**5.4 Security middleware**
- Helmet headers present.
- CORS restricted via env.
- 10kb body limit returns 413.
- Rate limiter on auth endpoints returns 429.
- 10+ failed logins triggers `LOGIN_LOCKED`.
- No stack traces in `NODE_ENV=production`.

**5.5 Redis**
- `KEYS rate:*` exists during traffic.
- `TTL refresh:*` returns ~604800 right after login.
- `XLEN tasks:events` increments on task mutations.
- Rate limiter fail-open verified (stop redis → /auth/login still 200/401).

**5.6 Worker / Audit**
- Worker connects to stream on boot.
- `XINFO GROUPS tasks:events` shows `audit-group`.
- AuditLog row exists for every task mutation.
- `XACK` confirmed (messages do not redeliver).
- DLQ behavior after 3 failures verified.
- DLQ key format documented in `ai-context.md`.

**5.7 Tests**
- `docker compose -f docker-compose.test.yml exec api npx jest` runs the suite.
- Coverage ≥ 80% lines and branches.
- Every endpoint has happy + error paths.
- Auth: register, duplicate, login, wrong-password, refresh, replay, logout.
- Rate limiter 429 test.

**5.8 Observability**
- `/health` returns 200 with uptime.
- `/ready` returns 503 when DB or Redis down.
- pino-http logs include method, path, status, duration.
- `Authorization` redacted; `password` redacted — confirmed in actual log output.

**End-to-end walkthrough script (memorize, do not read)**
1. `PATCH /tasks/:id` arrives at Nginx :80.
2. Nginx proxies to `api:3000`.
3. `helmet` and `cors` set headers; `express.json({ limit: '10kb' })` parses body.
4. `pino-http` opens a request log.
5. `authenticate` verifies the JWT (no I/O), attaches `req.user`.
6. Route handler: `TaskIdParam.parse(req.params)`, `UpdateTaskSchema.parse(req.body)`.
7. Ownership check: fetch task with `board.ownerId`; compare to `req.user.id`; 403 if mismatch.
8. `prisma.task.update(...)`.
9. `publishTaskEvent({ action: 'UPDATED', ... })` — XADD to `tasks:events`.
10. Response `{ success: true, data: updatedTask }`.
11. Worker (running separately): `XREADGROUP audit-group worker-1 ... STREAMS tasks:events >` picks up the event.
12. `handleAudit` writes an `AuditLog` row.
13. `XACK tasks:events audit-group <id>` removes from PEL.
14. (On 3 failures: XADD to `tasks:events:dlq`, then XACK the main stream.)

## Commit

`week-03 complete: OWASP hardening, production patterns, Security Gate ready`

## Workflow Prompt

```
/workflow Day 15 — Security Gate self-review: walk every checklist item in §5.1–5.8 of flowboard-project-brief.docx.md, fix anything that fails, and rehearse the end-to-end walkthrough.

Deliverables:
1. Verify each subsection against the live stack (do not just check the code visually — run the actual commands):
   - 5.1 Build: `docker compose up`, `tsc --noEmit`, secret grep, .env.example diff.
   - 5.2 Auth: end-to-end register → login → refresh → replay → logout.
   - 5.3 Validation: grep for `...req.body`; confirm every body-accepting route uses Zod.strict().
   - 5.4 Middleware: Postman shows Helmet headers; 15kb body → 413; 101st login → 429; 11th wrong password → 429 LOGIN_LOCKED; NODE_ENV=production response has no stack.
   - 5.5 Redis: `redis-cli KEYS rate:*`, `TTL refresh:*`, `XLEN tasks:events` — all confirm behavior; stop redis, hit /auth/login, confirm fail-open.
   - 5.6 Worker: XINFO GROUPS, AuditLog rows present, XACK behavior, DLQ after 3 failures, DLQ doc in ai-context.md.
   - 5.7 Tests: jest --coverage ≥ 80% lines + branches; the listed auth and rate-limiter cases all present.
   - 5.8 Observability: /health 200, /ready 503 when redis stopped, redaction confirmed in real log output.
2. Fix every gap before tagging. No "I'll explain it" answers — the gate is verification, not promises.
3. Rehearse the PATCH /tasks/:id walkthrough OUT LOUD without reading the code: Nginx → api → middleware → Zod → ownership → Prisma → publishTaskEvent → response → Worker XREADGROUP → AuditLog → XACK → (DLQ if 3 failures).

End: `week-03 complete: OWASP hardening, production patterns, Security Gate ready` commit, then notify trainer.

Follow ai-context.md.
```
