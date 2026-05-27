import pino, { type Logger, type LoggerOptions } from 'pino';

const isDev = process.env.NODE_ENV === 'development';

// Exported so tests can construct an isolated logger with the same redact
// config and prove redaction without touching the singleton's stdout stream.
// Keep this object the single source of truth for redact paths.
export const loggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.refreshToken',
      '*.password',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
};

/* istanbul ignore next -- pretty-transport branch is dev-only and fixed at module load */
export const logger: Logger = pino({
  ...loggerOptions,
  ...(isDev ? { transport: { target: 'pino-pretty' } } : {}),
});
