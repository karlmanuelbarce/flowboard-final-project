import { createApp } from './app';
import { logger } from './lib/logger';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const app = createApp();

const server = app.listen(port, (): void => {
  logger.info({ port }, 'api listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'api shutting down');
  server.close((err) => {
    if (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
