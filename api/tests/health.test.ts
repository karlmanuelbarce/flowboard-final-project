import request from 'supertest';

import { createApp } from '../src/app';

const app = createApp();

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});

describe('unknown route', () => {
  it('returns 404 NOT_FOUND for unmatched paths', async () => {
    const res = await request(app).get('/this/does/not/exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
