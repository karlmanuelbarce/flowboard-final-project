import request from 'supertest';

import { createApp } from '../src/app';
import { registerUser } from './helpers';

const app = createApp();

describe('brute-force login protection', () => {
  it('locks the email after 10 failed attempts and returns 429 on the 11th', async () => {
    const { email } = await registerUser(app);
    const wrong = { email, password: 'definitely-not-the-real-pw' };

    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/auth/login').send(wrong);
      expect(res.status).toBe(401);
    }

    const locked = await request(app).post('/auth/login').send(wrong);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('LOGIN_LOCKED');
  });

  it('a successful login clears the failure counter', async () => {
    const password = 'correct-horse-staple-12';
    const { email } = await registerUser(app, password);
    // 12+ char wrong password so it passes the Zod min length and actually
    // exercises the bcrypt compare + the throttle counter.
    const wrongPw = 'wrong-but-long-enough-12';

    // 5 wrong attempts — counter at 5, still below threshold.
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/auth/login').send({ email, password: wrongPw });
      expect(res.status).toBe(401);
    }

    // Correct login resets the counter.
    await request(app).post('/auth/login').send({ email, password }).expect(200);

    // Another 10 wrong attempts must again only trip on the 11th — proving the
    // counter actually reset (otherwise we would lock immediately).
    for (let i = 0; i < 10; i += 1) {
      const res = await request(app).post('/auth/login').send({ email, password: wrongPw });
      expect(res.status).toBe(401);
    }
    const locked = await request(app).post('/auth/login').send({ email, password: wrongPw });
    expect(locked.status).toBe(429);
  }, 60_000);
});
