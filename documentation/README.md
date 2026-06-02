# FlowBoard API Documentation

## Bruno collection

Open the `bruno/` folder in [Bruno](https://www.usebruno.com/) (File → Open Collection → select `documentation/bruno`).

### Environment

Switch to the `Local` environment. It defines:

| Var | Default | Notes |
| :-- | :-- | :-- |
| `baseUrl` | `http://localhost:8081/api` | Nginx → `api:3000` |
| `email` | `alice@example.com` | Used by Register / Login |
| `password` | `correct-horse-staple-12` | ≥ 12 chars (Zod min) |
| `accessToken` | _empty_ | Filled by Register / Login / Refresh post-response scripts |
| `refreshToken` | _empty_ | Filled by Register / Login / Refresh post-response scripts |
| `boardId` | _empty_ | Filled by `Boards / Create Board` |
| `taskId` | _empty_ | Filled by `Tasks / Create Task` |

### Suggested run order (for a smoke test)

1. `Health / Health` and `Health / Ready` — confirm the stack is up.
2. `Auth / Register` — creates the user, populates `accessToken` and `refreshToken`.
   - If the email already exists (409), run `Auth / Login` instead.
3. `Auth / Login` — re-authenticate at any time.
4. `Boards / Create Board` — populates `boardId`.
5. `Boards / List Boards`, `Boards / Get Board`.
6. `Tasks / Create Task` — populates `taskId`.
7. `Tasks / Get Task`, `Tasks / Update Task`, `Tasks / Delete Task`.
8. `Boards / Delete Board` (now safe because the task was deleted).
9. `Auth / Refresh` — rotate; the env vars roll forward.
10. `Auth / Logout` — invalidates the current refresh token.

### Notes

- The post-response scripts only overwrite env vars on success — failed requests leave the previous values intact, so a 422/401 in the middle won't clobber a good token.
- `Get Board` / `Get Task` returns **404** (not 403) when the resource belongs to another user — this is the Authorization Leak Policy documented in `ai-context.md`.
- `Create Task` and the task PATCH/DELETE handlers publish to the `tasks:events` Redis stream. Watch the worker pick the event up with: `docker compose logs -f worker`.
