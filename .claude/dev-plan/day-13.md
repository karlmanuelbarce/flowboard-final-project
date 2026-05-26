# Day 13 — Pino Structured Logging

## Task

- `api/src/lib/logger.ts` exports a Pino instance with redaction.
- `pino-http` middleware logs every request: method, path, status, duration.
- Zero `console.log` remain in committed code.
- `Authorization` header and password fields are redacted — verified against actual log output.

## Dev Plan

**Files**
- `api/src/lib/logger.ts`
- `worker/src/lib/logger.ts` (same shape)
- `api/src/app.ts` — mount `pino-http` early in the middleware stack (after `helmet`/`cors`, before routes).

**Logger config**
```ts
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.refreshToken',
      'body.token',
    ],
    censor: '[REDACTED]',
  },
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});
```

**pino-http**
```ts
app.use(pinoHttp({
  logger,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
}));
```

**Replace console.log**
- Grep the repo: `grep -rn "console\." api/src worker/src` → every result becomes `logger.info`/`logger.warn`/`logger.error`.
- The `ioredis` `on('error', ...)` from Day 6 was likely `console.error`; replace.

**Edge cases**
- pino-pretty must only be loaded in dev — bundling it in prod is wasteful and the transport target requires the package to be installed.
- Logging the `req.body` directly will leak passwords; rely on the redact paths, do not log the whole body manually.
- For long-running worker logs, ensure the `pino` instance flushes on shutdown (`logger.flush()` in the SIGTERM handler).

**Verify**
- Run a login request; logs include the request line but `authorization` is `[REDACTED]` and `password` is `[REDACTED]`.
- `grep -rn "console\." api/src worker/src` returns nothing.

## Commit

`day-13: Pino structured logging`

## Workflow Prompt

```
/workflow Day 13 — Replace all logging with Pino, add pino-http, and confirm redaction works.

Deliverables:
1. api/src/lib/logger.ts and worker/src/lib/logger.ts: pino with LOG_LEVEL env, redact paths req.headers.authorization, req.headers.cookie, body.password, body.refreshToken, body.token (censor '[REDACTED]'), pino-pretty transport only when NODE_ENV=development.
2. Mount pino-http in api/src/app.ts after helmet/cors and before routes. customLogLevel: 5xx → error, 4xx → warn, else info. Lightweight req/res serializers (no full body).
3. Grep `console.` across api/src and worker/src; replace every hit with logger.info/warn/error. After: `grep -rn "console\." api/src worker/src` must return nothing.
4. In worker SIGTERM handler, call logger.flush() before process.exit so the last lines are not lost.
5. Manually verify: send a login request, tail logs, confirm authorization header shows [REDACTED] and password shows [REDACTED]. The redact serializer matters — do NOT log req.body verbatim.

Follow ai-context.md.
```
