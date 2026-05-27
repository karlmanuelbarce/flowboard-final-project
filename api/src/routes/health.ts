import { Router, type NextFunction, type Request, type Response } from 'express';

import { AppError } from '../errors/AppError';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

// Liveness probe: no I/O. A failing /health means the process itself is dead,
// which Docker/k8s should restart. Hot path — keep it cheap.
export const healthRouter: Router = Router();

healthRouter.get('/', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    data: { status: 'ok', uptime: process.uptime() },
  });
});

// Readiness probe: 200 only if BOTH Postgres and Redis answer within the
// timeout. The probe must not hang the load balancer — bounding each check at
// READY_TIMEOUT_MS prevents a partitioned Redis from keeping us "checking"
// forever and starving the LB of a decision.
export const readyRouter: Router = Router();

const READY_TIMEOUT_MS = 1500;

const withTimeout = <T>(p: Promise<T>, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`${label} readiness check timed out`)),
        READY_TIMEOUT_MS,
      ).unref();
    }),
  ]);

readyRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await withTimeout(prisma.$queryRaw`SELECT 1`, 'db');
      await withTimeout(redis.ping(), 'redis');
      res.status(200).json({
        success: true,
        data: { status: 'ready', db: 'ok', redis: 'ok' },
      });
    } catch {
      // Collapse all dependency failures into one code — the LB only needs
      // a binary answer and the specific reason is in the logs already.
      next(new AppError('Service not ready', 503, 'NOT_READY'));
    }
  },
);
