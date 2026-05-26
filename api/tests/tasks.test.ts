import request from 'supertest';

import { createApp } from '../src/app';
import { createBoard, registerUser } from './helpers';

const app = createApp();

describe('POST /tasks', () => {
  it('creates a task on a board the caller owns', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Do the thing', boardId });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Do the thing');
    expect(res.body.data.boardId).toBe(boardId);
  });

  it('rejects body without title with 422', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ boardId });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects creating a task on another user’s board with 403', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const boardId = await createBoard(app, alice.accessToken);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ title: 'Sneaky', boardId });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 404 when creating a task on a missing board', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'No board', boardId: '00000000-0000-4000-8000-000000000000' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BOARD_NOT_FOUND');
  });
});

describe('GET /tasks/:id', () => {
  it('returns the task to the owner', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'View me', boardId })
      .expect(201);

    const res = await request(app)
      .get(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
  });

  it('returns 404 for an unknown task id', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .get('/tasks/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });

  it('returns 422 for a non-uuid id', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .get('/tasks/not-a-uuid')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(422);
  });
});

describe('PATCH /tasks/:id', () => {
  it('updates the title for the owner', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Old', boardId })
      .expect(201);

    const res = await request(app)
      .patch(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
  });

  it('returns 403 when another user tries to patch', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const boardId = await createBoard(app, alice.accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'Alice task', boardId })
      .expect(201);

    const res = await request(app)
      .patch(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`)
      .send({ title: 'Hijacked' });
    // ai-context says 403 for cross-owner mutation. The day-09 plan accepted
    // 401/404 as fallbacks but the current code path returns 403.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('rejects an empty body (refine fires) with 422', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Anything', boardId })
      .expect(201);

    const res = await request(app)
      .patch(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('DELETE /tasks/:id', () => {
  it('deletes the task for the owner and returns 204', async () => {
    const { accessToken } = await registerUser(app);
    const boardId = await createBoard(app, accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Doomed', boardId })
      .expect(201);

    await request(app)
      .delete(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app)
      .get(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  it('returns 404 for an unknown id', async () => {
    const { accessToken } = await registerUser(app);
    const res = await request(app)
      .delete('/tasks/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TASK_NOT_FOUND');
  });

  it('returns 403 when another user tries to delete', async () => {
    const alice = await registerUser(app);
    const bob = await registerUser(app);
    const boardId = await createBoard(app, alice.accessToken);
    const created = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .send({ title: 'Alice task', boardId })
      .expect(201);

    const res = await request(app)
      .delete(`/tasks/${created.body.data.id}`)
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
