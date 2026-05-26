import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  ...(process.env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty' } }
    : {}),
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'worker shutting down');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('worker starting — stream consumer wired in a later day');

// Keep the process alive until a Redis Stream consumer is added (day 7+).
setInterval((): void => {
  logger.debug('worker heartbeat');
}, 60_000);
