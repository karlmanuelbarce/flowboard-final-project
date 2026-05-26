import { handleTaskEvent, parseTaskEvent } from './handlers/auditLog';
import { logger } from './logger';
import { prisma } from './prisma';
import { redis } from './redis';

const STREAM_KEY = 'tasks:events';
const DLQ_KEY = 'tasks:events:dlq';
const GROUP = 'audit-group';
const CONSUMER = 'worker-1';
const BATCH_COUNT = 10;
const BLOCK_MS = 5000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [100, 500, 2000]; // length must equal MAX_ATTEMPTS

let stopping = false;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// XGROUP CREATE will fail with BUSYGROUP if the group already exists — that is fine,
// we just want to make sure it exists. MKSTREAM lets us create the group on a
// fresh Redis where no events have been published yet.
const ensureGroup = async (): Promise<void> => {
  try {
    await redis.xgroup('CREATE', STREAM_KEY, GROUP, '$', 'MKSTREAM');
    logger.info({ group: GROUP, stream: STREAM_KEY }, 'consumer group created');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('BUSYGROUP')) {
      logger.info({ group: GROUP }, 'consumer group already exists');
      return;
    }
    throw err;
  }
};

const moveToDlq = async (
  fields: string[],
  errorMessage: string,
): Promise<void> => {
  // Pass through the original event fields plus the error reason so the DLQ
  // entry is self-describing for whoever investigates it.
  await redis.xadd(
    DLQ_KEY,
    '*',
    ...fields,
    'errorMessage',
    errorMessage,
    'failedAt',
    new Date().toISOString(),
  );
};

const processMessage = async (
  messageId: string,
  fields: string[],
): Promise<void> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const event = parseTaskEvent(fields);
      await handleTaskEvent(event);
      await redis.xack(STREAM_KEY, GROUP, messageId);
      if (attempt > 1) {
        logger.info({ messageId, attempt }, 'message processed after retry');
      }
      return;
    } catch (err) {
      lastError = err;
      logger.warn(
        { err, messageId, attempt },
        'audit handler failed; will retry',
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);
      }
    }
  }

  // All attempts exhausted: move to DLQ and ACK the original so it does not
  // loop forever in the pending entries list (ai-context.md non-negotiable #9).
  const errorMessage =
    lastError instanceof Error ? lastError.message : String(lastError);
  try {
    await moveToDlq(fields, errorMessage);
    await redis.xack(STREAM_KEY, GROUP, messageId);
    logger.error({ messageId, errorMessage }, 'message moved to DLQ');
  } catch (dlqErr) {
    // DLQ move failed — last resort: leave the message in the PEL. Next worker
    // restart (or a manual XCLAIM) can retry it. We log loudly so this does
    // not pass silently.
    logger.fatal(
      { err: dlqErr, messageId },
      'DLQ move failed; message stays in PEL',
    );
  }
};

type StreamRead =
  | Array<[stream: string, entries: Array<[id: string, fields: string[]]>]>
  | null;

const consumeLoop = async (): Promise<void> => {
  while (!stopping) {
    let response: StreamRead;
    try {
      response = (await redis.xreadgroup(
        'GROUP',
        GROUP,
        CONSUMER,
        'COUNT',
        BATCH_COUNT,
        'BLOCK',
        BLOCK_MS,
        'STREAMS',
        STREAM_KEY,
        '>',
      )) as StreamRead;
    } catch (err) {
      logger.error({ err }, 'xreadgroup failed; backing off');
      await sleep(1000);
      continue;
    }

    if (!response) continue;

    for (const [, entries] of response) {
      for (const [messageId, fields] of entries) {
        if (stopping) return;
        await processMessage(messageId, fields);
      }
    }
  }
};

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'worker shutting down');
  stopping = true;
  // Give the loop up to BLOCK_MS to exit its current XREADGROUP, then close.
  setTimeout(() => process.exit(0), BLOCK_MS + 1000).unref();
  try {
    await prisma.$disconnect();
    redis.disconnect();
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
  }
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

(async (): Promise<void> => {
  logger.info('worker starting');
  await ensureGroup();
  await consumeLoop();
  logger.info('consume loop exited');
  process.exit(0);
})().catch((err: unknown) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
