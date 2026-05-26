import { redis } from './redis';

const REFRESH_TTL_SECONDS = 604800; // 7 days

const keyFor = (userId: string, tokenId: string): string =>
  `refresh:${userId}:${tokenId}`;

export const store = async (userId: string, tokenId: string): Promise<void> => {
  // SET ... EX 604800 — every refresh-token key carries a TTL (ai-context.md hard rule).
  await redis.set(keyFor(userId, tokenId), '1', 'EX', REFRESH_TTL_SECONDS);
};

// Returns true iff this call atomically removed the key.
// DEL returns the number of keys removed (0 or 1 here). Two concurrent refresh
// requests with the same token race — exactly one gets 1, the other gets 0,
// preventing replay regardless of order.
export const consume = async (userId: string, tokenId: string): Promise<boolean> => {
  const removed = await redis.del(keyFor(userId, tokenId));
  return removed === 1;
};
