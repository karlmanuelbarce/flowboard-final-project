import request from 'supertest';

import { createApp } from '../src/app';
import { registerUser } from './helpers';

const app = createApp();

describe('POST /boards', () => {
  it('creates a board owned by the caller', async () => {
    const { accessToken, userId } = await registerUser(app);
    const res = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'My Board' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('My Board');
    expect(res.body.data.ownerId).toBe(userId);
  });

  it('rejects unauthenticated callers with 401', async () => {
    const res = await request(app).post('/boards').send({ name: 'No auth' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects empty name with 422', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '' });
    expect(res.status).toBe(422);
  });
});

describe('GET /boards', () => {
  it('lists only the caller’s boards', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Alice board' })
      .expect(201);
    await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ name: 'Bob board' })
      .expect(201);

    const res = await request(app)
      .get('/boards')
      .set('Authorization', `Bearer ${alice.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Alice board');
  });
});

describe('GET /boards/:id', () => {
  it('returns 200 for the owner', async () => {
    const { accessToken } = await registerUser(app);
    const create = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Mine' })
      .expect(201);

    const res = await request(app)
      .get(`/boards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(create.body.data.id);
  });

  it('returns 403 when another user requests it', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const create = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Alice only' })
      .expect(201);

    const res = await request(app)
      .get(`/boards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 404 for an unknown board', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .get('/boards/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOARD_NOT_FOUND');
  });
});

describe('DELETE /boards/:id', () => {
  it('deletes an empty board and returns 204', async () => {
    const { accessToken } = await registerUser(app);
    const create = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Empty' })
      .expect(201);

    await request(app)
      .delete(`/boards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app)
      .get(`/boards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('returns 404 when the board does not exist', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .delete('/boards/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOARD_NOT_FOUND');
  });

  it('returns 403 when another user tries to delete', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const create = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ name: 'Alice only' })
      .expect(201);

    const res = await request(app)
      .delete(`/boards/${create.body.data.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 409 when the board still has tasks', async () => {
    const { accessToken } = await registerUser(app);
    const board = await request(app)
      .post('/boards')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'With tasks' })
      .expect(201);

    await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Blocker', boardId: board.body.data.id })
      .expect(201);

    const res = await request(app)
      .delete(`/boards/${board.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOARD_HAS_TASKS');
  });
});
