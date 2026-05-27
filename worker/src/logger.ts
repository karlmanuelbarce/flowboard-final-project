import pino, { type Logger } from 'pino';

const isDev = process.env.NODE_ENV === 'development';

// Same redact config as the api logger. The worker primarily logs event-stream
// payloads and Prisma writes — none of those carry credentials today, but the
// redact paths are defense-in-depth so a future code change cannot leak them.
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
