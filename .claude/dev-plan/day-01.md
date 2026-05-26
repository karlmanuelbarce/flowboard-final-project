# Day 1 — Environment, AppError, Global Error Handler

## Task

- `docker compose up -d` brings up all five services (api, worker, db, redis, nginx) without manual intervention.
- AI context file (`ai-context.md`) is configured with project rules for error handling, TypeScript, and response shape.
- `AppError` class exists at `api/src/errors/AppError.ts` and compiles under `npx tsc --noEmit`.
- Global error handler is wired into `api/src/app.ts` as the **last** middleware.

## Dev Plan

**Files**
- `api/src/errors/AppError.ts` — class + `isAppError` type guard + `globalErrorHandler` middleware.
- `api/src/app.ts` — mount `globalErrorHandler` last, after all routes.

**Signatures**
```ts
export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) { super(message); }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

export const globalErrorHandler: ErrorRequestHandler = (err, req, res, _next) => { ... };
```

**Behavior**
- `AppError` → respond `{ success: false, message, code }` with `err.statusCode`.
- `ZodError` → 422 with field-level details.
- Prisma `P2025` (not found) → 404; `P2002` (unique) → 409.
- Anything else → 500. In `NODE_ENV=production`, the response body must not include `err.stack`.

**Edge cases**
- Headers already sent — delegate to default Express handler.
- `err` is `null`/`undefined` — return 500 with `{ code: 'INTERNAL_ERROR' }`.

**Verify**
- `docker compose ps` shows all services healthy.
- `docker compose exec api npx tsc --noEmit` exits 0.
- Hit a deliberate 404 route and confirm the response shape.

## Commit

`day-01: environment setup, AppError, global error handler`

## Workflow Prompt

```
/workflow Day 1 — Stand up the FlowBoard Docker stack and implement the error-handling foundation.

Deliverables:
1. Confirm `docker compose up -d` runs all five services (api, worker, db, redis, nginx). Diagnose any container that exits.
2. Create api/src/errors/AppError.ts with: an AppError class (message, statusCode, code), an isAppError type guard, and a globalErrorHandler ErrorRequestHandler.
3. The globalErrorHandler must map AppError, ZodError, Prisma P2025/P2002, and unknown errors to the standard { success: false, message, code } shape. Never leak stack traces when NODE_ENV=production.
4. Wire globalErrorHandler into api/src/app.ts as the LAST middleware, after all routes.
5. Confirm `docker compose exec api npx tsc --noEmit` exits clean.

Follow ai-context.md rules — no res.status().json() in catch blocks, errors via next(err), standard response shape.
```
