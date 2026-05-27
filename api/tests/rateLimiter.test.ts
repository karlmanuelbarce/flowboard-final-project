import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

// The limiter keys by req.ip. Supertest binds to 127.0.0.1, so all requests in
// this suite share the same `rate:127.0.0.1` counter. beforeEach in setup.ts
// flushes the limiter's DB index, so each test starts at zero.
//
// We send a Zod-invalid body so the request short-circuits at validation (422)
// without reaching the loginThrottle (which would lock the email after 10).
// The rate-limiter middleware sits BEFORE Zod, so each 422 still ticks its
// counter — that is exactly what we want to test in isolation.
describe('rate limiter on /auth/login', () => {
  it('allows 100 requests in the window then rejects the 101st with 429', async () => {
    const invalidBody = { email: 'not-an-email', password: 'short' };

    for (let i = 0; i < 100; i += 1) {
      const res = await request(app).post('/auth/login').send(invalidBody);
      expect(res.status).toBe(422);
    }
    const blocked = await request(app).post('/auth/login').send(invalidBody);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
  }, 60_000);
});
