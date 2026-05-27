import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

describe('body size limit (10 kb)', () => {
  it('returns 413 PAYLOAD_TOO_LARGE for a body larger than the limit', async () => {
    // ~15 kB padding inside a JSON-shaped envelope. The Zod schema would
    // reject this for content reasons too, but body-parser fires first because
    // it inspects Content-Length / raw bytes before JSON parsing finishes.
    const huge = 'x'.repeat(15_000);
    const res = await request(app)
      .post('/auth/register')
      .set('Content-Type', 'application/json')
      .send({ email: 'big@example.com', password: huge });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('accepts a small body just under the limit', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'small@example.com', password: 'correct-horse-staple-12' });
    expect(res.status).toBe(201);
  });
});

describe('helmet security headers', () => {
  it('includes X-Content-Type-Options and X-Frame-Options on responses', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    // Helmet sets either DENY or SAMEORIGIN depending on version — accept both.
    expect(['DENY', 'SAMEORIGIN']).toContain(res.headers['x-frame-options']);
  });
});
