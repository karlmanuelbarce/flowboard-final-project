# Day 4 — Boards CRUD, Full Route Layer

## Task

- Boards CRUD complete: `GET /boards`, `POST /boards`, `GET /boards/:id`, `DELETE /boards/:id`.
- All task routes wired into the main router and verified end-to-end in Postman/Bruno.
- Global error handler tested with a deliberate 404 — response shape confirmed.

## Dev Plan

**Files**
- `api/src/routes/boards.ts`
- `api/src/schemas/board.ts` (or inline)
- `api/src/app.ts` — mount `boardsRouter` and `tasksRouter`.

**Schemas**
```ts
const BoardIdParam = z.object({ id: z.string().uuid() });
const CreateBoardSchema = z.object({ name: z.string().min(1).max(120) }).strict();
```

**Behavior**
- `GET /boards` — list boards for the current request context (ownership filter comes Day 5 once auth is wired; for Day 4 a dev fallback is acceptable but mark with TODO).
- `POST /boards` — create board owned by the requesting user (placeholder until Day 5).
- `GET /boards/:id` — 404 via `AppError('Board not found', 404, 'BOARD_NOT_FOUND')`.
- `DELETE /boards/:id` — 204.

**Edge cases**
- Invalid UUID in path → 422 via `BoardIdParam.parse`.
- Deleting a board that owns tasks — decide cascade in schema (`onDelete: Cascade`) or block; document the choice.

**Verify**
- Postman/Bruno collection passes for all routes.
- Deliberate `GET /tasks/00000000-0000-0000-0000-000000000000` returns the standard error shape.
- `npx tsc --noEmit` clean.

## Commit

`day-04: boards CRUD, full route layer`

## Workflow Prompt

```
/workflow Day 4 — Implement boards CRUD and wire the full route layer.

Deliverables:
1. api/src/routes/boards.ts with GET /boards, POST /boards, GET /boards/:id, DELETE /boards/:id.
2. Zod schemas: BoardIdParam (UUID), CreateBoardSchema ({ name: 1-120 }).strict().
3. Mount both boardsRouter and tasksRouter in api/src/app.ts. The globalErrorHandler must remain LAST.
4. Decide and document the cascade behavior for deleting a board that has tasks (schema-level onDelete or 409 BOARD_HAS_TASKS).
5. Manually test every task and board endpoint in Postman/Bruno. Deliberately trigger a 404 and confirm { success: false, message, code } shape.

Note: ownership enforcement comes Day 5 once auth is wired. For now leave a TODO at the ownership-check site so it cannot be missed.

Follow ai-context.md.
```
