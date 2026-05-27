import request from 'supertest';

import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';

const app = createApp();

describe('GET /ready', () => {
  it('returns 200 when both Postgres and Redis answer', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { status: 'ready', db: 'ok', redis: 'ok' },
    });
  });

  it('returns 503 NOT_READY when Redis ping rejects', async () => {
    const spy = jest
      .spyOn(redis, 'ping')
      .mockRejectedValueOnce(new Error('connection refused'));
    try {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('NOT_READY');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns 503 NOT_READY when the Prisma readiness query rejects', async () => {
    const spy = jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValueOnce(new Error('database down'));
    try {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('NOT_READY');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns 503 NOT_READY when Redis hangs past the timeout', async () => {
    // Never resolve — the route's Promise.race must reject on its own timer.
    const spy = jest
      .spyOn(redis, 'ping')
      .mockImplementationOnce(() => new Promise(() => undefined));
    try {
      const res = await request(app).get('/ready');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('NOT_READY');
    } finally {
      spy.mockRestore();
    }
  }, 5000);
});
