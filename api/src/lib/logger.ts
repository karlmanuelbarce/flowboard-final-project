import pino, { type Logger } from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger: Logger = pino({
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
  ...(isDev ? { transport: { target: 'pino-pretty' } } : {}),
});
