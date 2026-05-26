import type { ErrorRequestHandler, Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

import { logger } from '../lib/logger';

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError;

interface ErrorBody {
  success: false;
  message: string;
  code: string;
  details?: unknown;
  stack?: string;
}

// Prisma errors are duck-typed so the API package does not need @prisma/client today.
// PrismaClientKnownRequestError instances expose { name: 'PrismaClientKnownRequestError', code: 'P...' }.
interface PrismaKnownError {
  name: 'PrismaClientKnownRequestError';
  code: string;
  meta?: Record<string, unknown>;
}

const isPrismaKnownError = (err: unknown): err is PrismaKnownError =>
  typeof err === 'object' &&
  err !== null &&
  (err as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
  typeof (err as { code?: unknown }).code === 'string';

export const globalErrorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err === null || err === undefined) {
    logger.error('globalErrorHandler received null/undefined error');
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    } satisfies ErrorBody);
    return;
  }

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      code: err.code,
    } satisfies ErrorBody);
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    } satisfies ErrorBody);
    return;
  }

  if (isPrismaKnownError(err)) {
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Resource not found',
        code: 'NOT_FOUND',
      } satisfies ErrorBody);
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'Resource already exists',
        code: 'CONFLICT',
      } satisfies ErrorBody);
      return;
    }
  }

  logger.error({ err }, 'unhandled error');

  const body: ErrorBody = {
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR',
  };

  if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(500).json(body);
};
