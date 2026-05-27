import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { Level } from 'pino';
import pinoHttp from 'pino-http';

import { AppError, globalErrorHandler } from './errors/AppError';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { authenticate } from './middleware/authenticate';
import { authRouter } from './routes/auth';
import { boardsRouter } from './routes/boards';
import { healthRouter, readyRouter } from './routes/health';
import { tasksRouter } from './routes/tasks';

export const createApp = (): Express => {
  const app = express();

  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? [];

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(
    pinoHttp({
      logger,
      // 5xx → error, 4xx → warn, else info. Keeps prod log volume meaningful.
      customLogLevel: (_req, res, err): Level => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      // Whitelist req/res fields so the full body (which can hold passwords or
      // refresh tokens) never reaches the log even if redact paths drift.
      serializers: {
        req: (req: { method: string; url: string; id: string }) => ({
          method: req.method,
          url: req.url,
          id: req.id,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Public.
  app.use('/health', healthRouter);
  app.use('/ready', readyRouter);
  app.use('/auth', authRouter);

  // Protected.
  app.use('/boards', authenticate, boardsRouter);
  app.use('/tasks', authenticate, tasksRouter);

  app.use((req: Request, _res: Response, next: NextFunction): void => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  app.use(globalErrorHandler);

  return app;
};
