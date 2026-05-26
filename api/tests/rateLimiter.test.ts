import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

// The limiter keys by req.ip. Supertest binds to 127.0.0.1, so all requests in
// this suite share the same `rate:127.0.0.1` counter. beforeEach in setup.ts
// flushes the limiter's DB index, so each test starts at zero.
describe('rate limiter on /auth/login', () => {
  it('allows 100 requests in the window then rejects the 101st with 429', async () => {
    const creds = { email: 'rl@example.com', password: 'wrong-password-xxx' };

    // Burn 100 attempts with wrong credentials — each returns 401 but still
    // counts toward the limit. Then the 101st should be the rate-limit error
    // (limiter runs BEFORE the handler).
    for (let i = 0; i < 100; i += 1) {
      const res = await request(app).post('/auth/login').send(creds);
      expect(res.status).toBe(401);
    }
    const blocked = await request(app).post('/auth/login').send(creds);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMIT_EXCEEDED');
  }, 60_000);
});
