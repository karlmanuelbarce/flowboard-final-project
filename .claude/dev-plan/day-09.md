# Day 9 — Integration Test Suite

## Task

- Integration tests with Jest + Supertest cover every endpoint with at least one happy-path and one error-path.
- Tests run via `docker compose -f docker-compose.test.yml exec api npx jest`.
- A dedicated test database is used and reset between test files.

## Dev Plan

**Files**
- `api/tests/setup.ts` — global setup: connect Prisma, truncate tables before each file.
- `api/tests/auth.test.ts`
- `api/tests/tasks.test.ts`
- `api/tests/boards.test.ts`
- `api/tests/rateLimiter.test.ts`
- `api/jest.config.ts` — `setupFilesAfterEach: ['<rootDir>/tests/setup.ts']`, `testEnvironment: 'node'`.
- `docker-compose.test.yml` — overrides `DATABASE_URL` and `REDIS_DB` to test instances.

**Test matrix (handbook §5 Day 9-10)**
| Endpoint | Happy | Error |
| :-- | :-- | :-- |
| POST /auth/register | 201 + tokens | duplicate email → 409 |
| POST /auth/login | 200 + tokens | wrong password → 401 |
| POST /auth/refresh | 200 + new pair | reused token → 401 |
| POST /auth/logout | 204 | missing token → 422 |
| GET /tasks/:id | 200 | unknown id → 404 |
| POST /tasks | 201 | missing title → 422 |
| PATCH /tasks/:id | 200 | other user's task → 403 (depends on Day 11 — for Day 9 accept 401/404, refine Day 11) |
| DELETE /tasks/:id | 204 | unknown id → 404 |
| Rate limiter on /auth/login | 100 OK | 101st → 429 |

**Truncation strategy**
```ts
const tables = ['AuditLog', 'Task', 'Board', 'User'];
for (const t of tables) {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${t}" RESTART IDENTITY CASCADE;`);
}
await redis.flushdb();
```

**Edge cases**
- Tests cannot rely on Day 1's seed — they create their own fixtures.
- Rate limiter test must run in isolation or reset the `rate:*` keys in `beforeEach`.
- Refresh-replay test: capture the first refresh response, then re-send the original token; expect 401.

**Verify**
- `docker compose -f docker-compose.test.yml exec api npx jest` exits 0.
- All listed cases present.

## Commit

`day-09: integration test suite`

## Workflow Prompt

```
/workflow Day 9 — Build the integration test suite (Jest + Supertest) against the test Docker stack.

Deliverables:
1. docker-compose.test.yml: overrides DATABASE_URL to a test DB and uses a separate Redis DB index (REDIS_DB=1) so dev state is untouched.
2. api/tests/setup.ts: connect Prisma, TRUNCATE AuditLog, Task, Board, User with RESTART IDENTITY CASCADE in beforeEach, and `redis.flushdb()` for the test Redis instance.
3. api/jest.config.ts: testEnvironment node, setupFilesAfterEach pointed at setup.ts.
4. Test files (one per route group):
   - auth.test.ts: register success, duplicate email 409, login success, wrong password 401, refresh success, replay 401, logout 204.
   - tasks.test.ts: GET success + 404, POST success + 422 missing title, PATCH success + ownership/auth failure, DELETE 204 + 404.
   - boards.test.ts: list, create, get-by-id success + 404, delete.
   - rateLimiter.test.ts: 100 OK then 101st returns 429; flush `rate:*` keys before the test.
5. Refresh-replay test must capture the original refresh token, then re-send it; expect 401.

Run: `docker compose -f docker-compose.test.yml exec api npx jest`. All pass.

Note: ownership 403 path may be incomplete until Day 11 — accept 401/404 today and refine Day 11.

Follow ai-context.md.
```
