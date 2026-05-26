import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

const CREDS = { email: 'alice@example.com', password: 'correct-horse-staple-12' };

describe('POST /auth/register', () => {
  it('returns 201 and tokens on success', async () => {
    const res = await request(app).post('/auth/register').send(CREDS);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(CREDS.email);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('returns 409 for duplicate email', async () => {
    await request(app).post('/auth/register').send(CREDS).expect(201);
    const res = await request(app).post('/auth/register').send(CREDS);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('returns 422 for an invalid body', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/auth/register').send(CREDS).expect(201);
  });

  it('returns 200 and tokens on correct credentials', async () => {
    const res = await request(app).post('/auth/login').send(CREDS);
    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
  });

  it('returns 401 on wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: CREDS.email, password: 'wrong-password-here-xxx' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns 401 on unknown email (same shape as wrong password)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: CREDS.password });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('POST /auth/refresh', () => {
  let originalRefreshToken: string;

  beforeEach(async () => {
    const reg = await request(app).post('/auth/register').send(CREDS).expect(201);
    originalRefreshToken = reg.body.data.refreshToken;
  });

  it('rotates tokens on success', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(originalRefreshToken);
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('rejects replay of an already-consumed refresh token', async () => {
    await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken })
      .expect(200);

    const replay = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: originalRefreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rejects a forged refresh token', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: 'not.a.real.jwt' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');
  });
});

describe('POST /auth/logout', () => {
  it('returns 204 and invalidates the refresh token', async () => {
    const reg = await request(app).post('/auth/register').send(CREDS).expect(201);
    const refreshToken: string = reg.body.data.refreshToken;

    await request(app).post('/auth/logout').send({ refreshToken }).expect(204);

    const afterLogout = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it('returns 422 when refreshToken is missing', async () => {
    const res = await request(app).post('/auth/logout').send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
