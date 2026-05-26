import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { AppError, globalErrorHandler } from './errors/AppError';
import { logger } from './lib/logger';
import { healthRouter } from './routes/health';

export const createApp = (): Express => {
  const app = express();

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()) ?? [];

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins.length > 0 ? allowedOrigins : false,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);

  app.use((req: Request, _res: Response, next: NextFunction): void => {
    next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
  });

  app.use(globalErrorHandler);

  return app;
};
