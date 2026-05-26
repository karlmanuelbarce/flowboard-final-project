# Day 12 — Brute-Force Protection, Mass Assignment, No Stack Traces in Prod

## Task

- 10 failed `POST /auth/login` in 1 minute triggers lockout or heavy throttle.
- Mass assignment is impossible — Zod `.strict()` strips/refuses unknown fields; no `req.body` spread into Prisma anywhere.
- `NODE_ENV=production` responses never include a stack trace.

## Dev Plan

**Brute-force**
- Add a dedicated middleware `loginThrottle` (separate from the global `rateLimiter`).
- Key: `login:fail:{emailLower}` and `login:fail:{ip}` — use both, take the stricter.
- On a failed login: `INCR`, set `EXPIRE 60` if first failure, throw `AppError(429, 'LOGIN_LOCKED')` if count ≥ 10.
- On a successful login: `DEL login:fail:{emailLower}` and `DEL login:fail:{ip}`.
- Fail-open if Redis is down (same policy as the Day 6 rate limiter), but log it as **warning** so the gap is visible.

**Mass assignment**
- Every Zod schema that maps to a Prisma write uses `.strict()`. Surface a `VALIDATION_ERROR` 422 when the body carries unknown fields.
- Audit each Prisma write — confirm fields are listed explicitly, never `data: { ...body }`.
- Schemas to recheck: `CreateTaskSchema`, `UpdateTaskSchema`, `CreateBoardSchema`, `RegisterSchema`, `LoginSchema`, refresh/logout schemas.

**Production stack trace suppression**
- `globalErrorHandler` already redacts in prod — re-verify. The response body in `NODE_ENV=production` must contain only `success`, `message`, `code`. Stack goes to the logger only.
- Add a test: spin up the app with `NODE_ENV=production`, throw a synthetic 500, assert the response body has no `stack`/`details` fields.

**Edge cases**
- Lockout based on IP is bypassable from new IPs. Lockout based on email is bypassable when the attacker varies emails. Using both, taking the stricter, raises the cost.
- Successful login should clear the counter so a user who fumbles 3 times then succeeds is not locked out.

**Verify**
- Script 10 wrong-password attempts on one email — request 11 returns 429 `LOGIN_LOCKED`.
- `POST /tasks` with extra field `{ isAdmin: true }` — returns 422 with `VALIDATION_ERROR`.
- Force a 500 in production mode; response body has no stack.

## Commit

`day-12: brute-force protection, mass assignment prevention`

## Workflow Prompt

```
/workflow Day 12 — Brute-force protection on login, audit mass assignment, lock down prod error responses.

Deliverables:
1. api/src/middleware/loginThrottle.ts: keys `login:fail:{emailLower}` and `login:fail:{ip}` (TTL 60s, max 10). On failed login INCR both; if either ≥ 10 throw AppError(429, 'LOGIN_LOCKED'). On successful login DEL both. Fail-open on Redis errors with a logger.warn.
2. Wire loginThrottle so it sees the result of the password check — either inside the login route handler (preferred: explicit success/failure increment/clear), or via a small post-auth hook.
3. Audit every Zod schema that maps to a Prisma write. Add .strict() where missing. Confirm no `data: { ...body }` patterns anywhere — grep for `...req.body`. Schemas to recheck: CreateTask, UpdateTask, CreateBoard, Register, Login, Refresh, Logout.
4. Confirm globalErrorHandler redacts stack and any `details` field when NODE_ENV=production. Stack goes to logger only. Add a test that boots the app with NODE_ENV=production, triggers a synthetic 500, and asserts response body keys are exactly { success, message, code }.

Verify: 11th wrong password → 429 LOGIN_LOCKED; clearing happens on success; POST /tasks with isAdmin extra field → 422 VALIDATION_ERROR; prod 500 has no stack.

Follow ai-context.md.
```
