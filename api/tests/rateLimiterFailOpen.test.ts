import request from 'supertest';

import { createApp } from '../src/app';
import { redis } from '../src/lib/redis';

const app = createApp();

// Simulate Redis going away mid-request by stubbing `incr` to throw. The
// rate limiter must log a warning and call next() — the request must reach
// the auth handler and return its normal status, never 500.
describe('rate limiter fail-open', () => {
  it('lets the request through with a 401 (not 500) when Redis incr throws', async () => {
    const incrSpy = jest
      .spyOn(redis, 'incr')
      .mockRejectedValueOnce(new Error('connection refused'));
    try {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password: 'no-such-password-12' });
      // Wrong creds → 401 from the auth handler. NOT 500.
      expect(res.status).toBe(401);
      expect(incrSpy).toHaveBeenCalled();
    } finally {
      incrSpy.mockRestore();
    }
  });
});
