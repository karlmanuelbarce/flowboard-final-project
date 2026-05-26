import { logger } from './logger';
import { redis } from './redis';

export type TaskEventAction = 'CREATED' | 'UPDATED' | 'DELETED';

export interface TaskEvent {
  action: TaskEventAction;
  entityId: string;
  userId: string;
}

const STREAM_KEY = 'tasks:events';
const STREAM_MAXLEN_APPROX = '10000';

// Publish a task event onto the Redis stream consumed by the audit worker.
// Failure mode: log + swallow. The Prisma mutation has already committed by the time
// this is called, so a Redis outage would otherwise turn into a misleading 500 to the
// client. The trade-off is missed audit entries while Redis is down — acceptable for
// now; Day 11+ may add a durable outbox.
export const publishTaskEvent = async (event: TaskEvent): Promise<void> => {
  try {
    await redis.xadd(
      STREAM_KEY,
      'MAXLEN',
      '~',
      STREAM_MAXLEN_APPROX,
      '*',
      'action',
      event.action,
      'entity',
      'Task',
      'entityId',
      event.entityId,
      'userId',
      event.userId,
      'occurredAt',
      new Date().toISOString(),
    );
  } catch (err) {
    logger.error(
      { err, action: event.action, entityId: event.entityId },
      'failed to publish task event',
    );
  }
};
