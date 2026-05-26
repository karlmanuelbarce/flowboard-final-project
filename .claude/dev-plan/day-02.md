# Day 2 — Typed Task Routes with Zod

## Task

- All four task routes typed and Zod-validated: `GET /tasks/:id`, `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id`.
- No implicit `any` anywhere. `npx tsc --noEmit` passes with zero errors.
- Errors flow through `next(err)` only — no `res.status().json()` in `catch`.

## Dev Plan

**Files**
- `api/src/routes/tasks.ts` — router and handlers.
- `api/src/schemas/task.ts` — Zod schemas (or co-locate inside `routes/tasks.ts` if small).

**Schemas**
```ts
const TaskIdParam = z.object({ id: z.string().uuid() });

const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  priority: z.enum(['LOW','MEDIUM','HIGH']).default('MEDIUM'),
  boardId: z.string().uuid(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  priority: z.enum(['LOW','MEDIUM','HIGH']).optional(),
}).strict();
```

**Handler signature pattern**
```ts
export const getTask = async (
  req: Request<z.infer<typeof TaskIdParam>>,
  res: Response,
  next: NextFunction,
): Promise<void> => { try { ... } catch (err) { next(err); } };
```

**Behavior**
- `GET /tasks/:id` — `findUnique` then 404 via `AppError('Task not found', 404, 'TASK_NOT_FOUND')`.
- `POST /tasks` — Zod parse, `prisma.task.create({ data: { title, description, priority, boardId } })`. Never spread `req.body`.
- `PATCH /tasks/:id` — Zod parse partial; if both fields missing, 422.
- `DELETE /tasks/:id` — `delete`, return 204 No Content.
- Response shape on success: `{ success: true, data: task }`.

**Verify**
- `docker compose exec api npx tsc --noEmit` clean.
- Hit each route in Postman/Bruno; confirm shape and 404 path.

## Commit

`day-02: typed task routes with Zod validation`

## Workflow Prompt

```
/workflow Day 2 — Implement the four task routes with strict TypeScript and Zod validation.

Deliverables:
1. api/src/routes/tasks.ts with: GET /tasks/:id, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id.
2. Define Zod schemas: TaskIdParam (UUID), CreateTaskSchema (title 1-255, description optional, priority enum default MEDIUM, boardId UUID), UpdateTaskSchema (.strict, at least one of title/priority).
3. Each handler signature uses Request<z.infer<typeof Schema>>. All async handlers wrap in try/catch and call next(err). No res.status().json() in catch blocks. Never spread req.body into Prisma.
4. 404 path throws AppError(404, 'TASK_NOT_FOUND'). 422 on invalid body via the global handler.
5. DELETE returns 204; success returns { success: true, data }.
6. `docker compose exec api npx tsc --noEmit` must pass with zero errors.

Follow ai-context.md.
```
