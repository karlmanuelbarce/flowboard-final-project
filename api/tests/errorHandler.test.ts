import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { z } from 'zod';

import { AppError, globalErrorHandler } from '../src/errors/AppError';

// Stand up a stripped-down Express app whose only job is to surface a chosen
// error through globalErrorHandler. Lets us exercise every error class the
// production handler must distinguish without coupling to real routes.
const buildErrorApp = (err: unknown, headersSent = false): Express => {
  const app = express();
  app.get('/boom', (_req: Request, res: Response, next: NextFunction): void => {
    if (headersSent) {
      res.status(200).end();
    }
    next(err);
  });
  app.use(globalErrorHandler);
  return app;
};

// Express collapses next(null|undefined) into "no error", so the null branch
// of globalErrorHandler can only be reached by invoking it directly.
const invokeDirectly = (err: unknown): { status: number; body: unknown } => {
  let status = 0;
  let body: unknown;
  const res = {
    headersSent: false,
    status(code: number) {
      status = code;
      return this;
    },
    json(payload: unknown) {
      body = payload;
      return this;
    },
  } as unknown as Response;
  globalErrorHandler(err, {} as Request, res, (() => undefined) as NextFunction);
  return { status, body };
};

describe('globalErrorHandler', () => {
  it('returns 500 INTERNAL_ERROR when the error is null (direct invocation)', () => {
    const { status, body } = invokeDirectly(null);
    expect(status).toBe(500);
    expect((body as { code: string }).code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 INTERNAL_ERROR when the error is undefined (direct invocation)', () => {
    const { status, body } = invokeDirectly(undefined);
    expect(status).toBe(500);
    expect((body as { code: string }).code).toBe('INTERNAL_ERROR');
  });

  it('passes through to default handler when headers are already sent', async () => {
    // Supertest still receives the 200 because next(err) after headers-sent
    // delegates to the default handler which closes the response.
    const res = await request(buildErrorApp(new Error('late'), true)).get('/boom');
    expect(res.status).toBe(200);
  });

  it('maps AppError to its statusCode + code', async () => {
    const res = await request(
      buildErrorApp(new AppError('teapot', 418, 'TEAPOT')),
    ).get('/boom');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ success: false, message: 'teapot', code: 'TEAPOT' });
  });

  it('maps ZodError to 422 VALIDATION_ERROR with field details', async () => {
    const result = z.object({ x: z.number() }).safeParse({ x: 'no' });
    if (result.success) throw new Error('Expected Zod parse to fail');
    const res = await request(buildErrorApp(result.error)).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('maps Prisma P2025 to 404 NOT_FOUND', async () => {
    const prismaErr = Object.assign(new Error('record not found'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
    });
    const res = await request(buildErrorApp(prismaErr)).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('maps Prisma P2002 to 409 CONFLICT', async () => {
    const prismaErr = Object.assign(new Error('unique violation'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
    });
    const res = await request(buildErrorApp(prismaErr)).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  it('falls through Prisma branch for unknown Prisma codes', async () => {
    const prismaErr = Object.assign(new Error('something else'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P9999',
    });
    const res = await request(buildErrorApp(prismaErr)).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('returns 500 INTERNAL_ERROR for an unknown error and includes stack in non-production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const res = await request(buildErrorApp(new Error('unexpected'))).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(typeof res.body.stack).toBe('string');
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('does NOT include a stack trace when NODE_ENV=production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(buildErrorApp(new Error('unexpected'))).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.stack).toBeUndefined();
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
