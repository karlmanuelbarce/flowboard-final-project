# Day 11 — Helmet, CORS, Body Size, Trust Proxy, Ownership Checks

## Task

- `helmet()` middleware applied globally — security headers visible in every response.
- CORS restricted to origins from `ALLOWED_ORIGINS` env var.
- Body size limited to 10kb; oversize payload returns 413.
- `app.set('trust proxy', 1)` set (Nginx is in front).
- Every board/task route enforces ownership — modifying another user's resource returns 403.

## Dev Plan

**Files**
- `api/src/app.ts` — middleware stack.
- `api/src/middleware/requireOwnership.ts` — helper that loads the resource and checks `ownerId`.
- `api/src/routes/boards.ts`, `api/src/routes/tasks.ts` — wire ownership checks.

**Middleware order in `app.ts` (matters)**
```ts
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) ?? ['http://localhost:3000'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.set('trust proxy', 1);
// pino-http (Day 13)
// rate limiter on auth only
// routes
// globalErrorHandler (LAST)
```

**Ownership patterns**
- Boards: `req.user.id === board.ownerId`, else `AppError(403, 'FORBIDDEN')`. 404 if board does not exist (and do not leak which it is — same wording either way).
- Tasks: `req.user.id === task.board.ownerId` (task ownership flows through the board). One Prisma query that includes `board: { select: { ownerId: true } }`.
- For list endpoints (`GET /boards`, `GET /tasks`): filter by `ownerId: req.user.id`, do not throw.

**Edge cases**
- Express 4 returns 413 with HTML by default on body too large — the `globalErrorHandler` should recognize `err.type === 'entity.too.large'` and return the standard JSON shape with code `PAYLOAD_TOO_LARGE`.
- CORS preflight (`OPTIONS`) must succeed before auth runs — `cors()` is mounted before `authenticate`.
- 404 vs 403 information leak: prefer 404 when the resource exists but the user has no rights, OR prefer 403 — pick one and apply it consistently. Document the choice in `ai-context.md`. Default here: **404** for read-after-mismatch, **403** for write-after-mismatch.

**Verify**
- Postman shows `X-Content-Type-Options`, `X-Frame-Options`, etc.
- `POST /tasks` with 15kb body → 413 JSON with `PAYLOAD_TOO_LARGE`.
- User A token modifying User B's task → 403.
- CORS preflight from a forbidden origin → blocked.

## Commit

`day-11: Helmet, CORS, ownership checks`

## Workflow Prompt

```
/workflow Day 11 — Apply Helmet, strict CORS, body size limit, trust proxy, and ownership enforcement everywhere.

Deliverables:
1. Update api/src/app.ts middleware order: helmet() → cors({ origin: ALLOWED_ORIGINS env, credentials: true }) → express.json({ limit: '10kb' }) → app.set('trust proxy', 1) → routes → globalErrorHandler LAST.
2. globalErrorHandler must recognize Express body-too-large errors (err.type === 'entity.too.large') and respond { success:false, code: 'PAYLOAD_TOO_LARGE' } with 413.
3. api/src/middleware/requireOwnership.ts (or inline helpers) for boards and tasks. For tasks, ownership flows through board.ownerId — one Prisma query selecting board: { select: { ownerId: true } }.
4. Apply ownership to GET/PATCH/DELETE /boards/:id and /tasks/:id. For list endpoints (GET /boards, GET /tasks), filter by ownerId rather than throwing.
5. Decide 404-vs-403 leak policy: 404 on read mismatch, 403 on write mismatch. Document this in ai-context.md under a new "Authorization Leak Policy" section.

Verify: Postman shows Helmet headers; 15kb body returns 413 JSON; User A modifying User B's task returns 403; CORS preflight from forbidden origin blocked.

Refine the Day 9 PATCH ownership test now that 403 is real.

Follow ai-context.md.
```
