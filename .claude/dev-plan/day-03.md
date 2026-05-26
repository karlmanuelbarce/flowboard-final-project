# Day 3 — Prisma Schema, Migration, Seed

## Task

- `prisma/schema.prisma` committed with `User`, `Board`, `Task`, `AuditLog`, and the `TaskStatus` + `Priority` enums.
- Migration runs cleanly: `docker compose exec api npx prisma migrate dev --name init`.
- Seed loads without errors: 1 user, 2 boards, 3 tasks on the first board.
- Prisma Studio confirms records exist.

## Dev Plan

**Files**
- `api/prisma/schema.prisma`
- `api/prisma/seed.ts`
- `api/package.json` — `"prisma": { "seed": "ts-node prisma/seed.ts" }`

**Schema (per handbook §4 Day 3)**
- `User { id @id @default(uuid()), email @unique, password, createdAt, boards Board[], auditLogs AuditLog[] }`
- `Board { id, name, ownerId, owner @relation, tasks Task[], createdAt }`
- `Task { id, title, description?, status TaskStatus @default(TODO), priority Priority @default(MEDIUM), boardId, board @relation, createdAt, updatedAt @updatedAt }`
- `AuditLog { id, userId, user @relation, action, entity, entityId, createdAt }`
- `enum TaskStatus { TODO IN_PROGRESS REVIEW DONE }`
- `enum Priority { LOW MEDIUM HIGH }`

**Seed (`prisma/seed.ts`)**
- Hash the password with bcrypt cost 12.
- Use `upsert` keyed on `email` and `id` so the seed is idempotent — running twice does not error.

**Edge cases**
- Seed run twice → no unique-constraint crash (handled by upsert).
- Migration directory generated under `api/prisma/migrations/` — commit it.

**Verify**
- Migration files committed.
- `docker compose exec api npx prisma studio` shows 1 user, 2 boards, 3 tasks.

## Commit

`day-03: prisma schema, migration, seed data`

## Workflow Prompt

```
/workflow Day 3 — Define the FlowBoard data model in Prisma and seed it.

Deliverables:
1. api/prisma/schema.prisma with User, Board, Task, AuditLog models and TaskStatus + Priority enums per the trainee handbook.
2. Run the migration: `docker compose exec api npx prisma migrate dev --name init`. Confirm migration files are generated under api/prisma/migrations/ and ready to commit.
3. api/prisma/seed.ts — idempotent seed (use upsert): 1 user (email dev@flowboard.test, bcrypt cost 12), 2 boards owned by that user, 3 tasks on the first board.
4. Wire the seed via package.json `"prisma": { "seed": "ts-node prisma/seed.ts" }`.
5. Verify in Prisma Studio that records exist.

Follow ai-context.md. Seed must be safe to run twice.
```
