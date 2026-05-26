# Day 8 — Redis Streams, Worker Consumer, Async AuditLog

## Task

- `publishTaskEvent` writes to the `tasks:events` Redis Stream on every task create/update/delete in the API.
- Worker reads via `XREADGROUP` in a loop using consumer group `audit-group`, consumer name `worker-1`.
- Each event writes an `AuditLog` row, then `XACK` is called.
- After 3 failed processing attempts, the event is moved to `tasks:events:dlq` and `XACK`ed off the main stream.

## Dev Plan

**API side files**
- `api/src/lib/events.ts` — `publishTaskEvent`.
- Update `api/src/routes/tasks.ts` — replace the inline AuditLog inserts from Day 5 with `publishTaskEvent`.

**Worker side files**
- `worker/src/index.ts` — bootstrap, consumer group creation, consumer loop.
- `worker/src/handlers/audit.ts` — handler that writes the AuditLog row.
- `worker/src/lib/redis.ts`, `worker/src/lib/prisma.ts` — clients.

**Event shape**
```ts
interface TaskEvent {
  taskId: string;
  action: 'CREATED' | 'UPDATED' | 'DELETED';
  userId: string;
  payload: Record<string, unknown>;
}
```
Stored as flat field-value pairs via `XADD`. Payload JSON-encoded.

**Consumer setup**
- On boot: `XGROUP CREATE tasks:events audit-group $ MKSTREAM` — ignore `BUSYGROUP` error (group already exists).
- Loop: `XREADGROUP GROUP audit-group worker-1 COUNT 10 BLOCK 5000 STREAMS tasks:events >`.
- For each message:
  - Try `handleAudit(event)` → `XACK tasks:events audit-group <id>`.
  - On error: increment a per-message attempt counter (Redis hash `tasks:events:attempts` keyed by stream id, INCR with TTL). If attempts >= 3, `XADD tasks:events:dlq * ...originalFields... reason <err.message>` then `XACK` the main stream and `HDEL` the attempts entry.

**Edge cases**
- Worker crashes mid-process — message stays in PEL (pending entries list) and will be redelivered on next `XREADGROUP` with `>` after PEL inspection. Simplest correct behavior: also call `XAUTOCLAIM` periodically (stretch, not required Day 8).
- Duplicate AuditLog writes if XACK fails — make the handler idempotent (e.g., AuditLog has a `eventId` field unique on `(action, entity, entityId, ts)`), or accept best-effort dedup. Simplest: do not retry on Prisma unique-violation; ACK and move on.
- Stream grows forever — note in followup that `XTRIM MAXLEN ~ 100000` could be added later.

**Verify**
- `POST /tasks` → `docker compose exec redis redis-cli XLEN tasks:events` increments.
- Worker logs the event; AuditLog row appears in Prisma Studio.
- Force a handler error (throw) for 3 attempts; confirm an entry appears in `tasks:events:dlq` and disappears from the main stream PEL.

## Commit

`day-08: Redis Stream events, worker consumer, AuditLog integration`

## Workflow Prompt

```
/workflow Day 8 — Replace inline AuditLog writes with a Redis Stream + Worker consumer, with dead-letter handling.

Deliverables:
API side:
1. api/src/lib/events.ts: publishTaskEvent({ taskId, action: 'CREATED'|'UPDATED'|'DELETED', userId, payload }). Use XADD to `tasks:events` with flat field-value pairs; payload JSON-encoded; include a `ts` field.
2. Update api/src/routes/tasks.ts so POST/PATCH/DELETE call publishTaskEvent AFTER the DB mutation, BEFORE the response. Remove the inline AuditLog inserts from Day 5.

Worker side:
3. worker/src/lib/redis.ts and worker/src/lib/prisma.ts.
4. worker/src/index.ts: on boot, XGROUP CREATE tasks:events audit-group $ MKSTREAM (ignore BUSYGROUP). Loop: XREADGROUP GROUP audit-group worker-1 COUNT 10 BLOCK 5000 STREAMS tasks:events >.
5. worker/src/handlers/audit.ts: writes AuditLog { userId, action, entity: 'Task', entityId: taskId }.
6. Retry policy: on handler error, INCR `tasks:events:attempts` hash by stream id (with a 1h TTL). If attempts >= 3, XADD the original fields plus reason to `tasks:events:dlq`, then XACK the main stream and HDEL the attempts key. On success: XACK only.
7. Handler should be idempotent — on Prisma unique violation, log and ACK.

Verify: POST /tasks → XLEN tasks:events increments → AuditLog row appears. Force 3 failures → entry in tasks:events:dlq.

Follow ai-context.md. Update ai-context.md if the DLQ key format needs documenting (Day 14 will formalize this).
```
