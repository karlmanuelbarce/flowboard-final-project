# Day 5 — Auth Foundation, Protected Routes, AuditLog on Mutations

## Task

- `POST /auth/register` returns `{ accessToken, refreshToken }`.
- `POST /auth/login` returns the same on valid credentials.
- `authenticate` middleware verifies the JWT and attaches `req.user`. Protected routes return 401 without a valid Bearer token.
- AuditLog rows are created on task create/update/delete (synchronously, inline for now — Day 8 moves this to the worker).

## Dev Plan

**Files**
- `api/src/routes/auth.ts`
- `api/src/middleware/authenticate.ts`
- `api/src/lib/jwt.ts` — `signAccessToken`, `signRefreshToken`, `verifyAccessToken`.
- `api/src/types/express.d.ts` — augment `Request` with `user: { id: string }`.

**Schemas**
```ts
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(128),
}).strict();

const LoginSchema = RegisterSchema; // same shape
```

**Behavior**
- Register — hash password with bcrypt cost 12; `prisma.user.create`. 409 on duplicate email (`AppError(409, 'EMAIL_TAKEN')`).
- Login — `findUnique` by email, `bcrypt.compare`, return token pair on success. 401 on either user-not-found or wrong-password (do NOT distinguish — prevents enumeration). Use error code `INVALID_CREDENTIALS`.
- Access token TTL: 15m. Refresh token TTL: 7d. Use `JWT_SECRET` from env; refuse to boot if missing.
- `authenticate` — parse `Authorization: Bearer <token>`, verify, attach `req.user = { id }`. 401 with `UNAUTHORIZED` on failure. **No Redis/DB call** here — JWT is self-contained.
- Apply `authenticate` to all `/boards` and `/tasks` routes.
- After create/update/delete in tasks routes, insert an AuditLog row: `{ userId: req.user.id, action: 'CREATED|UPDATED|DELETED', entity: 'Task', entityId }`. Inline for Day 5; will move to the worker on Day 8.

**Edge cases**
- Missing `JWT_SECRET` env var → fail fast at startup, not at first request.
- Email comparison case-insensitive (store lowercase).
- Bcrypt timing: do the compare even when the user does not exist, to avoid timing attacks. (Compare against a dummy hash.)

**Verify**
- Register → token pair. Re-register same email → 409.
- Login wrong password → 401 with `INVALID_CREDENTIALS`.
- `GET /boards` without token → 401. With valid token → 200.
- After `POST /tasks`, an AuditLog row exists in Prisma Studio.

## Commit

`week-01 complete: API, auth foundation, Prisma schema`

## Workflow Prompt

```
/workflow Day 5 — JWT auth foundation, protected routes, and inline AuditLog on task mutations.

Deliverables:
1. api/src/lib/jwt.ts: signAccessToken (15m), signRefreshToken (7d), verifyAccessToken. Read JWT_SECRET from env; fail fast at boot if missing.
2. api/src/routes/auth.ts: POST /auth/register (bcrypt cost 12, 409 on duplicate email), POST /auth/login (compare against dummy bcrypt hash when user not found to prevent timing leaks, single error code INVALID_CREDENTIALS for both wrong-user and wrong-password).
3. api/src/middleware/authenticate.ts: parse Bearer token, verify, attach req.user = { id }. 401 UNAUTHORIZED on any failure. No Redis/DB calls.
4. Augment Express Request with `user: { id: string }` via api/src/types/express.d.ts.
5. Apply authenticate to all /boards and /tasks routes.
6. In task POST/PATCH/DELETE handlers, after the DB mutation, insert an AuditLog row { userId, action, entity: 'Task', entityId }. Mark this with `// TODO Day 8: move to worker via Redis Stream`.
7. RegisterSchema and LoginSchema both .strict(); password 12-128 chars.

Verify: register, duplicate email 409, login success, login wrong password 401, protected route without token 401, AuditLog row appears after a task mutation.

Follow ai-context.md.
```
