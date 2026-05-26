# Day 10 — Coverage, Mid-Point Review, Gap Fixes

## Task

- `jest --coverage` shows **≥ 80% lines and ≥ 80% branches**.
- Every Week 1 and Week 2 milestone from `flowboard-project-brief.docx.md` §4 is verified.
- Any gap from Days 1–9 is resolved and committed.

## Dev Plan

**Coverage gating**
- Add to `jest.config.ts`:
```ts
coverageThreshold: {
  global: { lines: 80, branches: 80, functions: 80, statements: 80 },
},
collectCoverageFrom: [
  'src/**/*.ts',
  '!src/**/*.d.ts',
  '!src/types/**',
  '!src/lib/prisma.ts',
],
```
- Coverage gaps almost always live in: error branches (401/403/404/409/422), Redis fail-open path, `globalErrorHandler` non-`AppError` branches. Add targeted tests for these.

**Week 1 & 2 milestone audit (run through this list)**
- `docker compose up` clean? `tsc --noEmit` clean?
- AppError + globalErrorHandler in place?
- All four task routes + four board routes typed + Zod + ownership-aware?
- Prisma schema + migration + idempotent seed?
- `/auth/register`, `/auth/login`, `/auth/refresh` (rotation), `/auth/logout`?
- `authenticate` on all `/boards` and `/tasks`?
- Rate limiter on `/auth/login` and `/auth/register`, fail-open?
- `publishTaskEvent` on every task mutation? Worker consuming and ACKing?
- DLQ on 3 retries?
- Integration tests for every endpoint?

**Edge cases**
- A passing coverage threshold can mask logic gaps — read each test you added; does it actually assert behavior, or just status codes?
- Coverage from generated Prisma client should be excluded.

**Verify**
- `docker compose -f docker-compose.test.yml exec api npx jest --coverage` succeeds and prints the table; thresholds met.
- Commit the milestone checklist itself to the repo as `.claude/dev-plan/week-1-2-audit.md` if useful.

## Commit

`week-02 complete: Redis, worker, auth hardening, test suite`

## Workflow Prompt

```
/workflow Day 10 — Drive coverage to ≥80% and audit every Week 1 and Week 2 milestone for gaps.

Deliverables:
1. Add coverageThreshold (lines/branches/functions/statements all 80) to jest.config.ts. Set collectCoverageFrom to src/**/*.ts excluding *.d.ts, src/types/**, and src/lib/prisma.ts.
2. Run `docker compose -f docker-compose.test.yml exec api npx jest --coverage`. For every file/branch under threshold, add targeted tests — focus on error branches (401/403/404/409/422), the rate-limiter fail-open path, and globalErrorHandler's non-AppError branches.
3. Walk the Week 1 + Week 2 milestone list in flowboard-project-brief.docx.md §4. For each item, confirm in code AND with a manual or test verification. Fix anything that fails the audit and commit those fixes BEFORE the week-02 tag.
4. Confirm: docker compose up clean; tsc --noEmit clean; rate limiter fail-open works (stop redis, hit /auth/login, get a non-500); worker ACKs and DLQ-after-3 both demonstrated.

End: `week-02 complete: Redis, worker, auth hardening, test suite` commit.

Follow ai-context.md.
```
