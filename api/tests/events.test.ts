import { publishTaskEvent } from '../src/lib/events';
import { redis } from '../src/lib/redis';

// Publishing must NOT throw when Redis is unreachable — the DB mutation that
// preceded the publish has already committed and the user's request is in
// flight. We accept losing the audit event over surfacing a misleading 500.
describe('publishTaskEvent', () => {
  it('writes an entry to tasks:events on success', async () => {
    await publishTaskEvent({
      action: 'CREATED',
      entityId: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000002',
    });
    const len = await redis.xlen('tasks:events');
    expect(len).toBeGreaterThan(0);
  });

  it('does NOT throw when redis.xadd throws', async () => {
    const xaddSpy = jest
      .spyOn(redis, 'xadd')
      .mockRejectedValueOnce(new Error('redis is down'));
    try {
      await expect(
        publishTaskEvent({
          action: 'UPDATED',
          entityId: '00000000-0000-4000-8000-000000000001',
          userId: '00000000-0000-4000-8000-000000000002',
        }),
      ).resolves.toBeUndefined();
      expect(xaddSpy).toHaveBeenCalled();
    } finally {
      xaddSpy.mockRestore();
    }
  });
});
