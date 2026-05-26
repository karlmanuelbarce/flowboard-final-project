---
name: flowboard-workflow
description: Run a FlowBoard task through the Explore → Plan → Act → Verify loop. Use when the user asks to implement, refactor, debug, or harden any part of FlowBoard (a TypeScript/Express/Prisma/Redis/Docker task management API). Enforces the project's non-negotiable conventions from ai-context.md — Zod validation, AppError + next(err), no req.body spreading, ownership checks, Pino logging, TTLs on Redis keys.
---

# FlowBoard Workflow Skill

You are working on **FlowBoard**, a containerized, TypeScript-strict, Redis-backed task management REST API. Before writing any code, you must execute the **Explore → Plan → Act → Verify** loop. Skipping a step produces confident-sounding wrong code. Do not skip steps.

The project conventions live in `ai-context.md` at the repo root. Read it before answering. Treat its non-negotiable rules as hard constraints.

---

## How to use this skill

When invoked, the user has given you a FlowBoard task — implement a feature, refactor, debug, harden, or add tests. Run the loop below. Be explicit about which phase you are in so the user can follow along.

For trivial tasks (single-line typo fix, rename), collapse Explore and Plan into one short paragraph — but never skip Verify.

---

## Step 1 — Explore

**Goal:** understand the problem and its constraints before touching code.

Do these in parallel where possible:

- Read `ai-context.md` (root) and `.claude/workflow.md` if you have not already this session.
- Read the file(s) the task most likely touches. Use Read, not search, when the path is known.
- Identify which conventions apply: error handling, Zod schema, ownership check, Redis key with TTL, event publish, Pino redaction.
- Identify the edge cases: auth missing/expired, wrong owner (403), invalid body (422), Redis down, DB down, replay attack, mass assignment, stack trace leak.

**Exit Explore when you can state, in one short paragraph:**

- The problem in one sentence
- The files that will be touched
- The edge cases that matter
- The conventions from `ai-context.md` that apply

If the user's request is ambiguous, ask **one** specific clarifying question now — not later. Cost of asking now is low; cost of building the wrong thing is high.

---

## Step 2 — Plan

**Goal:** decide the shape of the change before writing it.

Produce a short, specific plan. A plan is not a paragraph — it is a list of concrete decisions:

- Exact file paths to create or modify (e.g. `api/src/middleware/rateLimiter.ts`)
- Function signatures and return types
- Zod schema shapes for any new input
- Error paths — which `AppError` is thrown, which status code, which error code string
- Where the new code wires in (router, middleware stack position, worker handler map)
- For Redis: the key pattern and the TTL
- For events: which stream, which action, which payload fields

**Present the plan to the user before generating code.** For small changes (one file, < 30 lines), the plan can be a 3-4 line block in the same turn as the code. For anything larger, show the plan, then proceed.

If you cannot make the plan specific (you keep writing "add a function that..."), go back to Explore — you do not understand the problem yet.

---

## Step 3 — Act

**Goal:** generate code that matches the plan and the conventions.

Rules while acting:

- Follow `ai-context.md` exactly. The non-negotiable rules are hard constraints, not suggestions.
- All async route handlers: `try/catch`, errors via `next(err)`, never `res.status().json()` in `catch`.
- Every route that accepts data: Zod schema. Path IDs: `z.string().uuid()`.
- **Never** spread `req.body` into Prisma. Whitelist fields explicitly.
- TypeScript strict — annotate all function parameters and return types. No implicit `any`.
- Standard response shape: `{ success: true, data }` or `{ success: false, message, code }`.
- Use Pino, never `console.log`. Redact `Authorization` headers and password-like fields.
- No secrets in code. Read from `process.env` and document in `.env.example`.
- Ownership check before any board/task mutation: `resource.ownerId === req.user.id`, else `AppError(403, 'FORBIDDEN')`.
- Redis keys tied to auth always have a TTL.

Write the code using Edit/Write. Keep diffs tight — do not refactor surrounding code unless the task asked for it.

---

## Step 4 — Verify

**Goal:** prove it works and prove it is safe. Both passes are required.

**Does it work:**

- `npx tsc --noEmit` passes (run it via `docker compose exec api npx tsc --noEmit` if the stack is up)
- Existing tests still pass
- New behavior has at least one happy-path and one error-path test
- The happy path works end-to-end against the running Docker stack (mention how to test it — `curl`, Bruno, Postman — even if you cannot run it yourself)

**Is it safe:**

- No secrets in code
- No stack traces in production responses (`NODE_ENV=production` check)
- No sensitive fields in logs (Authorization, password, refresh token)
- Ownership enforced where relevant
- Input whitelisted via Zod — extra fields stripped
- For Redis-touching code: what happens when Redis is unreachable? Does it fail open (rate limiter) or hard-fail (refresh)? State it explicitly.
- For Worker code: are failed messages retried 3 times then sent to `tasks:events:dlq`? Is `XACK` always called?

End the turn with a one or two sentence summary: what changed and what is next.

---

## When to loop back

| Symptom | Loop back to |
| :-- | :-- |
| You are writing generic code | Explore — give yourself more context |
| The diff touches files you did not plan for | Plan — the plan was incomplete |
| You cannot explain a line you just wrote | Act — slow down, rewrite |
| Tests pass but a security/edge case is broken | Verify — your test set was too narrow |

---

## The Security Gate question

Every FlowBoard task contributes to passing the Security Gate. You are ready for the Gate when you can answer this without looking at the code:

> *"Walk me through what happens — from the moment a `PATCH /tasks/:id` request hits Nginx to the moment the AuditLog row is written."*

When relevant, check that your change does not break that end-to-end flow: Nginx → API container → `authenticate` middleware → Zod validation → Prisma update → publish to `tasks:events` stream → response → Worker `XREADGROUP` → AuditLog insert → `XACK`.
