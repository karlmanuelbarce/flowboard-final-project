# Day 7 — Refresh Token Rotation, Logout

## Task

- `POST /auth/refresh` validates the JWT, checks Redis, deletes the old token, issues a new pair, stores the new refresh token.
- `POST /auth/logout` deletes the refresh token from Redis and returns 204.
- Replay attack: using the same refresh token twice returns 401.

## Dev Plan

**Files**
- `api/src/routes/auth.ts` — add `/refresh` and `/logout`.
- `api/src/lib/jwt.ts` — refresh token payload now includes a `tokenId` (UUID).
- `api/src/lib/refreshStore.ts` — small wrapper around Redis for refresh tokens.

**Redis key**
- Pattern: `refresh:{userId}:{tokenId}`.
- TTL: 7 days (604800s).
- Value: any non-empty marker (e.g. `"1"`); existence is what matters.

**Refresh flow**
1. `RefreshSchema = z.object({ refreshToken: z.string() }).strict()`.
2. `verifyRefreshToken` (separate secret from access token).
3. Look up `refresh:{userId}:{tokenId}` — if missing, throw `AppError(401, 'INVALID_REFRESH_TOKEN')`.
4. `DEL` the key (atomic — see edge case below).
5. Generate new access token (15m) and new refresh token (7d, new `tokenId`).
6. `SET refresh:{userId}:{newTokenId} 1 EX 604800`.
7. Return `{ success: true, data: { accessToken, refreshToken } }`.

**Logout flow**
- `LogoutSchema = z.object({ refreshToken: z.string() }).strict()`.
- Verify, then `DEL refresh:{userId}:{tokenId}`. Idempotent — 204 even if the key was already gone.

**Edge cases**
- Replay race: two concurrent refresh calls with the same token. Use Lua or `MULTI/EXEC` so only one wins. Simplest correct version: `const removed = await redis.del(key); if (removed === 0) throw AppError(401, 'INVALID_REFRESH_TOKEN')`. Whichever request gets `1` proceeds; the other gets `0` and is rejected.
- Day 5 login does not yet store a refresh token in Redis — update login to `SET refresh:{userId}:{tokenId}` on success.
- JWT expired but key still present (clock skew) — `verifyRefreshToken` throws first; the key entry will expire on its own TTL.

**Verify**
- Login → use refresh once → get a new pair → use the **old** refresh again → 401.
- `docker compose exec redis redis-cli KEYS 'refresh:*'` shows the new key.
- Logout removes the key; `KEYS` returns nothing for that user.

## Commit

`day-07: refresh token rotation, logout endpoint`

## Workflow Prompt

```
/workflow Day 7 — Refresh-token rotation with Redis-backed revocation and logout.

Deliverables:
1. Update api/src/lib/jwt.ts: refresh tokens now carry a tokenId (UUID). Use a separate REFRESH_TOKEN_SECRET from the access-token secret; fail fast at boot if missing.
2. api/src/lib/refreshStore.ts: store(userId, tokenId, ttl=604800), exists(userId, tokenId), consume(userId, tokenId) → returns true if the key existed AND was deleted (use redis.del result === 1 for atomic single-winner semantics on concurrent replays).
3. Update Day 5's POST /auth/login to call refreshStore.store on success.
4. POST /auth/refresh: Zod-validate { refreshToken }, verifyRefreshToken, refreshStore.consume — if false, throw AppError(401, 'INVALID_REFRESH_TOKEN'). Then issue a new access + refresh pair, refreshStore.store the new one, return both tokens in the standard shape.
5. POST /auth/logout: verify token, refreshStore.consume, return 204 (idempotent).
6. Redis key format: `refresh:{userId}:{tokenId}`. TTL 604800s.

Verify manually: login → refresh works once → second use of the same refresh returns 401. `redis-cli KEYS refresh:*` reflects rotation.

Follow ai-context.md.
```
