import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../src/app';
import { AppError } from '../src/errors/AppError';
import { env } from '../src/lib/env';
import { requireUser } from '../src/middleware/authenticate';

const app = createApp();

// /boards is convenient: it is mounted behind `authenticate` and returns a
// deterministic shape on success.
describe('authenticate middleware', () => {
  it('returns 401 when the Authorization header is missing', async () => {
    const res = await request(app).get('/boards');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toMatch(/Missing/i);
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    const res = await request(app)
      .get('/boards')
      .set('Authorization', 'Basic dXNlcjpwYXNz');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Malformed/i);
  });

  it('returns 401 when the header has extra segments', async () => {
    const res = await request(app)
      .get('/boards')
      .set('Authorization', 'Bearer one two');
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Malformed/i);
  });

  it('returns 401 when the token is missing after Bearer', async () => {
    const res = await request(app).get('/boards').set('Authorization', 'Bearer ');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a forged token (wrong signature)', async () => {
    const forged = jwt.sign({ sub: 'someone' }, 'wrong-secret-xxxxxxxxxxxxxxxxxx');
    const res = await request(app)
      .get('/boards')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/Invalid|expired/i);
  });

  it('returns 401 for an expired token', async () => {
    const expired = jwt.sign({ sub: 'someone' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '-1s',
    });
    const res = await request(app)
      .get('/boards')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});

describe('requireUser helper', () => {
  it('throws UNAUTHORIZED when req.user is missing', () => {
    expect(() => requireUser({})).toThrow(AppError);
    try {
      requireUser({});
    } catch (err) {
      expect((err as AppError).statusCode).toBe(401);
      expect((err as AppError).code).toBe('UNAUTHORIZED');
    }
  });

  it('returns the user when present', () => {
    expect(requireUser({ user: { id: 'abc' } })).toEqual({ id: 'abc' });
  });
});
